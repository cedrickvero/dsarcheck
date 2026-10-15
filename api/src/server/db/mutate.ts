import type { ZodTypeAny } from "zod";
import { can } from "@/auth/authz";
import { withTenant, type Transaction } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { requireAuth, type Actor } from "@/server/auth/require-auth";
import { AppError, ValidationError } from "@/server/http/errors";
import { parseWith } from "@/server/http/validate";

/**
 * The single write path for the whole application.
 *
 * Order is fixed and non-negotiable (AGENTS.md #1 and #5):
 *
 *   authorization -> Zod validation -> ONE transaction(change + audit event)
 *
 * The audit row is inserted in the same transaction as the change, so a failed
 * change cannot leave an audit row behind, and a successful change cannot exist
 * without one.
 *
 * There is deliberately no opt-out. A mutation that bypasses this helper and
 * does not use `withTenant` never gets the tenant GUC set, so every RLS policy
 * evaluates to NULL and returns zero rows - it fails closed rather than
 * silently succeeding unscoped.
 */
export interface MutationSpec {
  /** Action name checked against the permission matrix. */
  action: string;
  /** Human-entered reason. Required - docs/05 § "Reason-required actions". */
  reason: string;
  objectType: string;
  objectId?: string;
  /** Zod schema the input must satisfy. */
  schema: ZodTypeAny;
  input: unknown;
  /** IP / session, or omit for "System". */
  meta?: Record<string, unknown>;
}

export async function mutate<R>(
  spec: MutationSpec,
  fn: (tx: Transaction, input: unknown) => Promise<R>,
): Promise<R> {
  // 1. authorization - throws loudly when unauthenticated, never a silent skip
  const actor: Actor = await requireAuth();

  const reason = spec.reason?.trim() ?? "";
  if (reason.length < 3) {
    throw new ValidationError("a reason is required for this action");
  }
  if (!can(actor, spec.action)) {
    throw new AppError(403, "forbidden", `not permitted: ${spec.action}`);
  }

  // 2. validation
  const input = parseWith(spec.schema, spec.input);

  // 3. one transaction: the change and its audit event commit together
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const result = await fn(tx, input);
      await tx.insert(auditEvents).values({
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: spec.action,
        category: spec.objectType,
        reason,
        objectType: spec.objectType,
        objectId: spec.objectId ?? null,
        meta: spec.meta ?? { actor: "System" },
      });
      return result;
    },
  );
}
