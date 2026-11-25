/**
 * The case-level erasure-outcome surface: records one system's outcome on an erasure case,
 * REUSING the R4 contract in src/server/erasure for the invariants (named human actor, no
 * autonomous path, requester-never-decides, high-risk approver-only, evidence requirement,
 * retention exception category) and the canonical snake_case outcome keys.
 *
 * This module persists the outcome to case_systems (the table the R4 contract deferred to)
 * and keeps the checklist status in sync, so the seed-parity checks() sees "Action required"
 * as a blocker. It writes ONE case-scoped audit event (action "erasure.outcome.recorded",
 * category "erasure") in the same transaction as the row update.
 */
import { and, asc, eq } from "drizzle-orm";
import { cases, caseSystems, users } from "@/db/schema";
import { withTenant } from "@/db/client";
import { can } from "@/server/authz";
import { writeAuditEvent } from "@/server/db/audit";
import { ForbiddenError, ValidationError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/require-auth";
import {
  assertHighRiskIsApproverOnly,
  assertNamedHumanActor,
  assertRequesterIsNotTheDecider,
} from "@/server/erasure/approval-gate";
import {
  ERASURE_OUTCOMES,
  isErasureOutcome,
  outcomeRule,
  type ErasureOutcome,
} from "@/server/erasure/outcomes";
import {
  evidenceRequirementSatisfied,
  isRetentionExceptionCategory,
  RETENTION_EXCEPTION_CATEGORIES,
} from "@/server/erasure/policy";

const MIN_REASON = 3;

export { ERASURE_OUTCOMES, RETENTION_EXCEPTION_CATEGORIES };
export type { ErasureOutcome };

/** The checklist status an erasure outcome maps to (the seed's CODE mapping): the outcome
 *  drives the resolution state, so "Action required" blocks and Deleted/Suppressed close it. */
export const CHECKLIST_STATUS_BY_OUTCOME: Record<
  ErasureOutcome,
  "Completed" | "Retained under exception" | "Not found" | "Action required"
> = {
  deleted: "Completed",
  suppressed: "Completed",
  retained_under_exception: "Retained under exception",
  not_found: "Not found",
  action_required: "Action required",
};

export interface ErasureSystemRow {
  sourceKey: string;
  name: string;
  outcome: ErasureOutcome | null;
  outcomeLabel: string | null;
  outcomeAt: Date | null;
  reason: string;
  exceptionCategory: string | null;
  ownerName: string | null;
}

export interface ErasureView {
  caseId: string;
  requestType: string;
  risk: string;
  systems: ErasureSystemRow[];
}

function assertMayRecord(actor: Actor, risk: string): void {
  if (risk === "High") {
    // The R4 contract is stricter than the permission matrix: the APPROVER role decides.
    if (!actor.roles.some((r) => can(r, "erasure.outcome.record.high_risk"))) {
      throw new ForbiddenError("High-risk erasure outcomes need an approver to decide");
    }
    assertHighRiskIsApproverOnly({ actor, risk: "high" });
    return;
  }
  if (!actor.roles.some((r) => can(r, "erasure.outcome.record"))) {
    throw new ForbiddenError("Your role does not permit recording erasure outcomes.");
  }
}

export async function getErasureOutcomes(actor: Actor, caseId: string): Promise<ErasureView | null> {
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [row] = await tx
        .select({ id: cases.id, requestType: cases.requestType, risk: cases.risk })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) return null;

      const systems = await tx
        .select({
          sourceKey: caseSystems.sourceKey,
          name: caseSystems.name,
          outcome: caseSystems.outcome,
          outcomeAt: caseSystems.outcomeAt,
          reason: caseSystems.reason,
          exceptionCategory: caseSystems.exceptionCategory,
          ownerName: users.name,
          ownerEmail: users.email,
        })
        .from(caseSystems)
        .leftJoin(users, eq(users.id, caseSystems.ownerId))
        .where(eq(caseSystems.caseId, caseId))
        .orderBy(asc(caseSystems.sourceKey));

      return {
        caseId,
        requestType: row.requestType,
        risk: row.risk,
        systems: systems.map((s) => ({
          ...s,
          outcome: isErasureOutcome(s.outcome) ? s.outcome : null,
          outcomeLabel: isErasureOutcome(s.outcome) ? outcomeRule(s.outcome).label : null,
          ownerName: s.ownerName || s.ownerEmail,
        })),
      };
    },
  );
}

export interface RecordErasureOutcomeInput {
  sourceKey: string;
  outcome: string;
  reason: string;
  exceptionCategory?: string;
  /** True when the system auto-attached an outcome record (satisfies the evidence rule). */
  hasOutcomeRecord?: boolean;
}

export async function recordErasureOutcome(
  actor: Actor,
  caseId: string,
  input: RecordErasureOutcomeInput,
): Promise<{ outcome: ErasureOutcome }> {
  // The R4 invariant: no autonomous path. requireAuth already yields a named human, but this
  // is the contract's explicit gate and stays here so a worker/cron actor cannot record.
  assertNamedHumanActor(actor);

  if (!isErasureOutcome(input.outcome)) {
    throw new ValidationError("invalid erasure outcome");
  }
  const outcome: ErasureOutcome = input.outcome;
  const rule = outcomeRule(outcome);
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) {
    throw new ValidationError("a reason is required to record an erasure outcome");
  }
  const exCat = (input.exceptionCategory ?? "").trim() || null;
  if (rule.requiresExceptionCategory && !isRetentionExceptionCategory(exCat)) {
    throw new ValidationError(
      `outcome "${rule.label}" requires a documented retention exception category`,
    );
  }
  if (
    !evidenceRequirementSatisfied({
      outcome,
      evidenceRef: null,
      hasOutcomeRecord: input.hasOutcomeRecord,
    })
  ) {
    throw new ValidationError(
      `outcome "${rule.label}" requires evidence or an automatically attached outcome record`,
    );
  }

  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [row] = await tx
        .select({ id: cases.id, risk: cases.risk })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) throw new ValidationError("unknown case");
      assertMayRecord(actor, row.risk);
      assertRequesterIsNotTheDecider({ actor, requesterActorId: null });

      const [system] = await tx
        .select({ id: caseSystems.id, name: caseSystems.name })
        .from(caseSystems)
        .where(and(eq(caseSystems.caseId, caseId), eq(caseSystems.sourceKey, input.sourceKey)))
        .limit(1);
      if (!system) throw new ValidationError("unknown system");

      const status = CHECKLIST_STATUS_BY_OUTCOME[outcome];

      await tx
        .update(caseSystems)
        .set({
          outcome,
          outcomeAt: new Date(),
          reason,
          exceptionCategory: outcome === "retained_under_exception" ? exCat : null,
          status,
          updatedAt: new Date(),
        })
        .where(eq(caseSystems.id, system.id));

      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: "erasure.outcome.recorded",
        category: "erasure",
        reason,
        objectType: "case",
        objectId: caseId,
        meta: {
          systemRef: input.sourceKey,
          caseId,
          outcome,
          outcomeLabel: rule.label,
          exceptionCategory: outcome === "retained_under_exception" ? exCat : null,
          hasOutcomeRecord: input.hasOutcomeRecord === true,
        },
      });

      return { outcome };
    },
  );
}
