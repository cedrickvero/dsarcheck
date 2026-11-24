/**
 * Bulk operations on the case list: assign owner, export CSV.
 *
 * Both are "sensitive actions" in the AGENTS.md sense - each case records WHY in its own
 * audit row - so both run inside ONE withTenant transaction that writes the change and the
 * audit events together. A partial batch is not a state this code can produce: the case
 * numbers are resolved first, and an unknown number aborts before anything is written.
 *
 * Server-only.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { cases, caseSystems, users } from "@/db/schema";
import { withTenant, type Transaction } from "@/db/client";
import { can } from "@/server/authz";
import { writeAuditEvent } from "@/server/db/audit";
import { AppError, ForbiddenError, ValidationError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/require-auth";
import { toCsv, type CaseListRow } from "@/domain/caseList";
import { caseListRowsInTx } from "./query";

/** The permission that covers working a case, including reassigning it (docs/01). */
function assertMayWorkCases(actor: Actor): void {
  if (!actor.roles.some((role) => can(role, "view_and_update_cases"))) {
    throw new ForbiddenError("Your role does not permit changing cases.");
  }
}

const MIN_REASON = 3;

/**
 * There is no per-case "assign" permission in the matrix - docs/01 gives every case-working
 * role the ability to reassign, and the reason + audit row is the control. So the gate is
 * `view_and_update_cases`, the same one that lets a role open the case at all.
 */
export interface BulkAssignResult {
  updated: number;
  ownerName: string;
}

export async function bulkAssignOwner(
  actor: Actor,
  input: { caseNumbers: readonly string[]; ownerId: string; reason: string },
): Promise<BulkAssignResult> {
  assertMayWorkCases(actor);

  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) {
    throw new ValidationError("a reason is required to reassign cases");
  }
  if (input.caseNumbers.length === 0) {
    throw new ValidationError("select at least one case");
  }

  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const owner = await resolveAssignee(tx, actor, input.ownerId);
      const rows = await resolveCases(tx, actor, input.caseNumbers);

      const updated = await tx
        .update(cases)
        .set({ ownerId: owner.id })
        .where(
          and(
            eq(cases.workspaceId, actor.workspaceId),
            inArray(cases.caseNumber, rows.map((row) => row.caseNumber)),
          ),
        )
        .returning({ caseNumber: cases.caseNumber });

      // Defensive: the numbers were resolved through the same tenant scope moments ago, so
      // a shortfall means the row moved under us. Better to fail than to report a partial
      // batch as done.
      if (updated.length !== rows.length) {
        throw new AppError(409, "conflict", "a selected case changed while the batch ran");
      }

      // One audit row per case: the list is a batch, the record is per case. A single row
      // covering N cases would make each case's history incomplete.
      for (const row of rows) {
        await writeAuditEvent(tx, {
          orgId: actor.orgId,
          workspaceId: actor.workspaceId,
          actorId: actor.userId,
          actorLabel: actor.label,
          action: `Owner changed to ${owner.displayName}`,
          category: "Case",
          reason,
          objectType: "case",
          objectId: row.id,
          meta: { caseNumber: row.caseNumber, ownerId: owner.id, batch: rows.length },
        });
      }

      return { updated: rows.length, ownerName: owner.displayName };
    },
  );
}

export interface ExportResult {
  csv: string;
  count: number;
  filename: string;
}

/**
 * CSV export. Exporting is itself an audited act (docs/05): every exported case gets a
 * "Case included in CSV export" row with the caller's reason, in the same transaction as
 * the read, so an export cannot happen without its trail.
 */
export async function exportCasesCsv(
  actor: Actor,
  input: { caseNumbers: readonly string[]; reason: string; now: Date },
): Promise<ExportResult> {
  assertMayWorkCases(actor);

  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) {
    throw new ValidationError("a reason is required to export cases");
  }
  if (input.caseNumbers.length === 0) {
    throw new ValidationError("select at least one case");
  }

  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const rows = await resolveCases(tx, actor, input.caseNumbers);

      for (const row of rows) {
        await writeAuditEvent(tx, {
          orgId: actor.orgId,
          workspaceId: actor.workspaceId,
          actorId: actor.userId,
          actorLabel: actor.label,
          action: "Case included in CSV export",
          category: "Case",
          reason,
          objectType: "case",
          objectId: row.id,
          meta: { caseNumber: row.caseNumber, batch: rows.length },
        });
      }

      // The CSV is built from the SAME transaction and projection the list uses, so what is
      // exported is exactly what the caller could already see.
      const all = await caseListRowsInTx(tx, actor);
      const wanted = new Set(input.caseNumbers);
      const selected = all.filter((row) => wanted.has(row.caseNumber));
      const csv = toCsv(selected, { viewerId: actor.userId, now: input.now });
      const stamp = input.now.toISOString().slice(0, 10);

      return { count: rows.length, csv, filename: `cases-${stamp}.csv` };
    },
  );
}

async function resolveAssignee(
  tx: Transaction,
  actor: Actor,
  ownerId: string,
): Promise<{ id: string; displayName: string }> {
  const [owner] = await tx
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.id, ownerId),
        eq(users.workspaceId, actor.workspaceId),
        sql`${users.disabledAt} is null`,
      ),
    )
    .limit(1);

  // A user id from another workspace is indistinguishable from a non-existent one: RLS hides
  // it, so the caller learns nothing about other tenants.
  if (!owner) throw new ValidationError("the selected owner is not a member of this workspace");

  return { id: owner.id, displayName: owner.name || owner.email };
}

async function resolveCases(
  tx: Transaction,
  actor: Actor,
  caseNumbers: readonly string[],
): Promise<{ id: string; caseNumber: string }[]> {
  const unique = [...new Set(caseNumbers)];
  const rows = await tx
    .select({ id: cases.id, caseNumber: cases.caseNumber })
    .from(cases)
    .where(and(eq(cases.workspaceId, actor.workspaceId), inArray(cases.caseNumber, unique)));

  // All or nothing: a batch containing one case the caller cannot see must not silently
  // apply to the rest.
  if (rows.length !== unique.length) {
    throw new AppError(404, "not_found", "one or more of those cases was not found");
  }
  return rows;
}

/** Exported for the race test: does this checklist row set add up to what the list shows? */
export async function checklistCounts(
  actor: Actor,
  tx: Transaction,
): Promise<Map<string, { done: number; total: number }>> {
  const rows = await tx
    .select({
      caseId: caseSystems.caseId,
      done: sql<number>`count(*) filter (where ${caseSystems.status} in ('Completed','Not found','Retained under exception'))::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(caseSystems)
    .where(eq(caseSystems.workspaceId, actor.workspaceId))
    .groupBy(caseSystems.caseId);

  return new Map(rows.map((r) => [r.caseId, { done: r.done, total: r.total }]));
}

/** Re-exported so callers do not reach for the raw row type. */
export type { CaseListRow };
