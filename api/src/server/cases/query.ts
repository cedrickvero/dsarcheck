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
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { cases, caseSystems, users, workspaces } from "@/db/schema";
import { withTenant, type Transaction } from "@/db/client";
import { can } from "@/server/authz";
import { ForbiddenError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/require-auth";
import type { CaseListRow } from "@/domain/caseList";

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

/**
 * Rows for the case list: owner and checklist counts joined in, ordered by nearest
 * deadline (the index on (workspace_id, statutory_due_at) serves exactly this).
 *
 * The view predicates, search and tie-break ordering live in the domain module - they are
 * pure and parity-tested against the prototype - so this only does what SQL should: scope,
 * join and order. `caseListRowsInTx` is exported so a caller already inside a transaction
 * (the CSV export) reads through the same projection instead of inventing a second one.
 */
export async function caseListRowsInTx(tx: Transaction, actor: Actor): Promise<CaseListRow[]> {
  const rows = await tx
    .select({
      caseNumber: cases.caseNumber,
      requestType: cases.requestType,
      status: cases.status,
      priority: cases.priority,
      ownerId: cases.ownerId,
      ownerName: users.name,
      ownerEmail: users.email,
      requesterName: cases.requesterName,
      requesterEmail: cases.requesterEmail,
      receivedAt: cases.receivedAt,
      dueAt: cases.statutoryDueAt,
      extensionMonths: cases.extensionMonths,
    })
    .from(cases)
    .leftJoin(users, eq(users.id, cases.ownerId))
    .where(eq(cases.workspaceId, actor.workspaceId))
    .orderBy(asc(cases.statutoryDueAt), asc(cases.caseNumber));

  const counts = await tx
    .select({
      caseId: caseSystems.caseId,
      done: sql<number>`count(*) filter (where ${caseSystems.status} in ('Completed','Not found','Retained under exception'))::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(caseSystems)
    .innerJoin(cases, eq(cases.id, caseSystems.caseId))
    .where(eq(caseSystems.workspaceId, actor.workspaceId))
    .groupBy(caseSystems.caseId, cases.caseNumber);

  const byNumber = new Map<string, { done: number; total: number }>();
  const idToNumber = new Map(
    rows.length
      ? (
          await tx
            .select({ id: cases.id, caseNumber: cases.caseNumber })
            .from(cases)
            .where(eq(cases.workspaceId, actor.workspaceId))
        ).map((r) => [r.id, r.caseNumber] as const)
      : [],
  );
  for (const count of counts) {
    const number = idToNumber.get(count.caseId);
    if (number) byNumber.set(number, { done: count.done, total: count.total });
  }

  return rows.map((row) => ({
    caseNumber: row.caseNumber,
    requestType: row.requestType,
    status: row.status,
    priority: row.priority,
    ownerId: row.ownerId,
    ownerName: row.ownerId ? row.ownerName || row.ownerEmail : null,
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    receivedAt: row.receivedAt,
    dueAt: row.dueAt,
    extensionMonths: row.extensionMonths as 0 | 1 | 2,
    checklistDone: byNumber.get(row.caseNumber)?.done ?? 0,
    checklistTotal: byNumber.get(row.caseNumber)?.total ?? 0,
  }));
}

/** The same rows, inside their own tenant transaction. */
export async function listCaseListRows(actor: Actor): Promise<CaseListRow[]> {
  assertMayReadCases(actor);
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    (tx) => caseListRowsInTx(tx, actor),
  );
}

/**
 * Workspace members who can be assigned a case. Disabled users are excluded: an assignment
 * to someone who cannot sign in is a queue that silently stops moving.
 */
export async function listAssignableOwners(
  actor: Actor,
): Promise<{ id: string; name: string }[]> {
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const rows = await tx
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(eq(users.workspaceId, actor.workspaceId), sql`${users.disabledAt} is null`))
        .orderBy(asc(users.name), asc(users.email));
      return rows.map((r) => ({ id: r.id, name: r.name || r.email }));
    },
  );
}

/** The workspace's display name, for the page subtitle. Tenant-scoped like everything else. */
export async function workspaceNameFor(actor: Actor): Promise<string> {
  const rows = await withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) =>
      tx
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, actor.workspaceId))
        .limit(1),
  );
  return rows[0]?.name ?? "This workspace";
}
