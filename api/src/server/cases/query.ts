/**
 * Case reads. Server-only - never import this into a client component.
 *
 * TENANT ISOLATION IS DONE TWICE, deliberately: the query runs inside withTenant(), so
 * Postgres RLS scopes it to the actor's workspace, AND the actor is authorized with the
 * real can() matrix before any query runs. The database is the backstop; the
 * authorization seam is the gate.
 *
 * A cross-tenant case number is therefore indistinguishable from a missing one: RLS
 * hides the row, the query returns nothing, and the caller renders not-found. That is
 * the owner-approved mapping - permission-denied would confirm the case exists elsewhere.
 */
import { and, desc, eq } from "drizzle-orm";
import { cases } from "@/db/schema";
import { withTenant } from "@/db/client";
import { can } from "@/server/authz";
import { ForbiddenError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/require-auth";

export type CaseRow = typeof cases.$inferSelect;
export type CaseStatusValue = CaseRow["status"];

export const CASE_NUMBER_PATTERN = /^DSAR-\d{4}-\d{5}$/;

/** Unauthorized role -> 403. Unauthenticated callers never get here (requireAuth -> 401). */
function assertMayReadCases(actor: Actor): void {
  if (!actor.roles.some((role) => can(role, "view_and_update_cases"))) {
    throw new ForbiddenError("Your role does not permit viewing cases.");
  }
}

export async function listCases(actor: Actor): Promise<CaseRow[]> {
  assertMayReadCases(actor);
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) =>
      tx
        .select()
        .from(cases)
        .where(eq(cases.workspaceId, actor.workspaceId))
        .orderBy(desc(cases.receivedAt)),
  );
}

export async function listCasesByStatus(actor: Actor, status: CaseStatusValue): Promise<CaseRow[]> {
  assertMayReadCases(actor);
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) =>
      tx
        .select()
        .from(cases)
        .where(and(eq(cases.workspaceId, actor.workspaceId), eq(cases.status, status)))
        .orderBy(desc(cases.receivedAt)),
  );
}

/**
 * Look up one case by number. Malformed numbers return null rather than throwing: a
 * validation error would distinguish "badly formatted" from "exists in another
 * workspace", which the owner's mapping forbids.
 */
export async function getCaseByNumber(actor: Actor, caseNumber: string): Promise<CaseRow | null> {
  assertMayReadCases(actor);
  if (!CASE_NUMBER_PATTERN.test(caseNumber)) return null;
  const rows = await withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) =>
      tx
        .select()
        .from(cases)
        .where(and(eq(cases.workspaceId, actor.workspaceId), eq(cases.caseNumber, caseNumber)))
        .limit(1),
  );
  return rows[0] ?? null;
}
