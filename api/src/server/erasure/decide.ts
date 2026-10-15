/**
 * The single human-gated erasure decision path.
 *
 * Fixed order, the R1 mutate() pattern: authorization -> Zod validation -> ONE transaction
 * containing the change and its immutable audit event.
 *
 * WHY THIS COMPOSES THE PATTERN RATHER THAN CALLING mutate(): mutate() calls requireAuth()
 * (a hard 501 until T-08) and consults the static permission matrix, so it cannot be
 * exercised at the contract layer. R4 must not weaken either of those by adding an
 * injectable actor to the single write path - that would create exactly the second,
 * bypassable authorization path the product owner has ruled out. The invariants are
 * identical here, and the audit row still goes through the ONE writer (writeAuditEvent),
 * so there remains exactly one insert path into audit_events.
 *
 * THERE IS NO AUTONOMOUS PATH. assertNamedHumanActor refuses a missing, empty, or
 * system/worker/cron actor before anything else runs, so no queue, worker, cron, retention
 * job or integration can record a destructive outcome on its own initiative. Nothing in
 * this module deletes, purges, suppresses or anonymizes anything: it records a HUMAN
 * DECISION about what happened, and the immutable audit event is that record.
 *
 * Server-only.
 */
import { z } from "zod";
import { withTenant, type Transaction } from "@/db/client";
import { authorize, type PermissionSource } from "@/server/auth/authorize";
import type { Actor } from "@/server/auth/require-auth";
import { writeAuditEvent } from "@/server/db/audit";
import { ValidationError } from "@/server/http/errors";
import { parseWith } from "@/server/http/validate";
import {
  assertHighRiskIsApproverOnly,
  assertNamedHumanActor,
  assertRequesterIsNotTheDecider,
  type DecisionRisk,
} from "./approval-gate";
import { isErasureOutcome, outcomeRule, type ErasureOutcome } from "./outcomes";
import { evidenceRequirementSatisfied, isRetentionExceptionCategory } from "./policy";

export const ERASURE_PERMISSIONS = {
  record: "erasure.outcome.record",
  recordHighRisk: "erasure.outcome.record.high_risk",
} as const;

export const erasureDecisionSchema = z.object({
  systemRef: z.string().trim().min(1, "a data-source reference is required"),
  outcome: z
    .string()
    .refine(isErasureOutcome, { message: "invalid erasure outcome" }),
  // Non-empty after trimming: a whitespace-only reason is not a reason.
  reason: z.string().trim().min(1, "a non-empty human-entered reason is required"),
  exceptionCategory: z.string().trim().optional(),
  evidenceRef: z.string().trim().optional(),
  hasOutcomeRecord: z.boolean().optional(),
  risk: z.enum(["standard", "high"]).default("standard"),
});

export type ErasureDecisionInput = z.infer<typeof erasureDecisionSchema>;

export interface RecordedErasureDecision {
  readonly systemRef: string;
  readonly outcome: ErasureOutcome;
  readonly label: string;
  readonly exceptionCategory: string | null;
  readonly evidenceRef: string | null;
  readonly hasOutcomeRecord: boolean;
  readonly risk: DecisionRisk;
  readonly decidedBy: string;
  readonly requestId: string;
}

export interface RecordErasureOutcomeArgs {
  /** The deciding actor. Required, and required to be human. */
  readonly actor: Actor | null | undefined;
  /** Correlates the audit row with the request that caused it. */
  readonly requestId: string;
  /** The R2 injectable authorization seam; T-08 supplies the real permission source. */
  readonly permissions: PermissionSource;
  readonly decision: unknown;
  /** The DSAR requester, when known: a requester may never decide an erasure outcome. */
  readonly requesterActorId?: string | null;
}

/**
 * Record a human decision about one data source's erasure outcome.
 *
 * @throws ValidationError for a missing actor, a missing/blank reason, an invalid outcome
 *   or category, a missing exception category on Retained, or an unmet evidence rule.
 * @throws AuthorizationDeniedError when the actor may not exercise the permission.
 * @throws AppError(403) for a high-risk decision by a non-Approver, or a requester deciding.
 */
export async function recordErasureOutcome(
  args: RecordErasureOutcomeArgs,
): Promise<RecordedErasureDecision> {
  // 0. There is no autonomous path: this refuses a missing, empty or non-human actor
  //    before anything else is read, validated or written.
  assertNamedHumanActor(args.actor);
  const actor = args.actor;

  // 1. authorization, before validation and before any write
  await authorize({
    actor,
    workspaceId: actor.workspaceId,
    permission: ERASURE_PERMISSIONS.record,
    source: args.permissions,
  });

  // 2. Zod validation
  const input: ErasureDecisionInput = parseWith(erasureDecisionSchema, args.decision);
  const rule = outcomeRule(input.outcome);

  // 2a. a requester may never decide, whatever permissions they hold
  assertRequesterIsNotTheDecider({ actor, requesterActorId: args.requesterActorId });

  // 2b. a high-risk decision is Approver-only, and needs its own permission
  if (input.risk === "high") {
    await authorize({
      actor,
      workspaceId: actor.workspaceId,
      permission: ERASURE_PERMISSIONS.recordHighRisk,
      source: args.permissions,
    });
    assertHighRiskIsApproverOnly({ actor, risk: input.risk });
  }

  // 2c. outcome-specific contract rules
  if (rule.requiresExceptionCategory && !isRetentionExceptionCategory(input.exceptionCategory ?? null)) {
    throw new ValidationError(
      `outcome "${rule.label}" requires a documented retention exception category`,
    );
  }
  if (
    !evidenceRequirementSatisfied({
      outcome: input.outcome,
      evidenceRef: input.evidenceRef,
      hasOutcomeRecord: input.hasOutcomeRecord,
    })
  ) {
    throw new ValidationError(
      `outcome "${rule.label}" requires evidence or an automatically attached outcome record`,
    );
  }

  const exceptionCategory =
    input.outcome === "retained_under_exception" ? (input.exceptionCategory ?? null) : null;
  const evidenceRef = input.evidenceRef ?? null;
  const hasOutcomeRecord = input.hasOutcomeRecord === true;

  // 3. ONE transaction: the change and its audit event commit together, or neither does.
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx: Transaction) => {
      // FUTURE (the migration that creates the data-source/system entity): the
      // erasure_outcomes insert belongs HERE, inside this transaction, so the row and its
      // audit event commit together. R4 adds no table by owner decision, so the immutable
      // audit event below IS the record of the decision for now.
      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: "erasure.outcome.recorded",
        category: "erasure",
        // Human-entered and required: the DB CHECK rejects a blank attribution.
        reason: input.reason,
        objectType: "data_source",
        objectId: null,
        meta: {
          systemRef: input.systemRef,
          outcome: input.outcome,
          outcomeLabel: rule.label,
          exceptionCategory,
          evidenceRef,
          hasOutcomeRecord,
          risk: input.risk,
          requestId: args.requestId,
        },
      });

      return {
        systemRef: input.systemRef,
        outcome: input.outcome,
        label: rule.label,
        exceptionCategory,
        evidenceRef,
        hasOutcomeRecord,
        risk: input.risk,
        decidedBy: actor.userId,
        requestId: args.requestId,
      } satisfies RecordedErasureDecision;
    },
  );
}
