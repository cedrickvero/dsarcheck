/**
 * Erasure outcomes (docs/03 E4b, docs/05 erasure rules): each system in an erasure case
 * records one outcome (Deleted / Suppressed / Retained under exception / Not found / Action
 * required). "Retained under exception" needs a category + reason; every outcome needs a
 * reason. A high-risk case may only have outcomes recorded by an approver (owner /
 * workspace_admin included), matching the identity high-risk rule.
 *
 * The recording writes the outcome row AND its audit event in ONE transaction.
 */
import { and, asc, eq } from "drizzle-orm";
import { cases, caseSystems, users } from "@/db/schema";
import { withTenant } from "@/db/client";
import { can } from "@/server/authz";
import { writeAuditEvent } from "@/server/db/audit";
import { ForbiddenError, ValidationError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/require-auth";
import { EXCEPTION_CATEGORIES } from "./checklist";

const MIN_REASON = 3;

export const ERASURE_OUTCOMES = [
  "Deleted",
  "Suppressed / anonymized",
  "Retained under exception",
  "Not found",
  "Action required",
] as const;
export type ErasureOutcome = (typeof ERASURE_OUTCOMES)[number];

export interface ErasureSystemRow {
  sourceKey: string;
  name: string;
  outcome: string | null;
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
  counts: Record<ErasureOutcome, number>;
}

function assertMayRecordOutcome(actor: Actor, risk: string): void {
  // The two erasure permissions are alternatives by risk, not layers: high-risk is
  // approver/owner only; ordinary cases are handler/owner/admin/system_owner (not approver).
  if (risk === "High") {
    if (!actor.roles.some((r) => can(r, "erasure.outcome.record.high_risk"))) {
      throw new ForbiddenError("High-risk erasure outcomes need an approver to decide");
    }
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

      const counts = Object.fromEntries(ERASURE_OUTCOMES.map((o) => [o, 0])) as Record<ErasureOutcome, number>;
      for (const s of systems) {
        if (s.outcome && (ERASURE_OUTCOMES as readonly string[]).includes(s.outcome)) {
          counts[s.outcome as ErasureOutcome] += 1;
        }
      }

      return {
        caseId,
        requestType: row.requestType,
        risk: row.risk,
        systems: systems.map((s) => ({ ...s, ownerName: s.ownerName || s.ownerEmail })),
        counts,
      };
    },
  );
}

export interface RecordErasureOutcomeInput {
  sourceKey: string;
  outcome: string;
  reason: string;
  exceptionCategory?: string;
}

export async function recordErasureOutcome(
  actor: Actor,
  caseId: string,
  input: RecordErasureOutcomeInput,
): Promise<{ outcome: string }> {
  if (!(ERASURE_OUTCOMES as readonly string[]).includes(input.outcome)) {
    throw new ValidationError("unknown erasure outcome");
  }
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) {
    throw new ValidationError("a reason is required to record an erasure outcome");
  }
  const exCat = (input.exceptionCategory ?? "").trim() || null;
  if (input.outcome === "Retained under exception") {
    if (!exCat || !(EXCEPTION_CATEGORIES as readonly string[]).includes(exCat)) {
      throw new ValidationError("an exception category is required to retain data under exception");
    }
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
      assertMayRecordOutcome(actor, row.risk);

      const [system] = await tx
        .select({ id: caseSystems.id, name: caseSystems.name })
        .from(caseSystems)
        .where(and(eq(caseSystems.caseId, caseId), eq(caseSystems.sourceKey, input.sourceKey)))
        .limit(1);
      if (!system) throw new ValidationError("unknown system");

      await tx
        .update(caseSystems)
        .set({
          outcome: input.outcome,
          outcomeAt: new Date(),
          reason,
          exceptionCategory: input.outcome === "Retained under exception" ? exCat : null,
          updatedAt: new Date(),
        })
        .where(eq(caseSystems.id, system.id));

      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: `System "${system.name || input.sourceKey}" outcome recorded as ${input.outcome}`,
        category: "Erasure",
        reason,
        objectType: "case",
        objectId: caseId,
        meta: { systemKey: input.sourceKey, outcome: input.outcome },
      });

      return { outcome: input.outcome };
    },
  );
}
