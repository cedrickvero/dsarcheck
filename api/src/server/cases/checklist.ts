/**
 * The data-source checklist: the per-system rows for a case, and the status transition
 * with its guards. A status change is a sensitive action, so it runs in ONE withTenant
 * transaction that writes the row AND its audit event together.
 *
 * Guards (docs/03 E3): "Completed" needs evidence; "Retained under exception" needs an
 * exception category (and the reason); "Not found" and "Action required" carry a reason.
 * The operator reason is required for every change and is what the audit row records.
 */
import { and, asc, eq } from "drizzle-orm";
import { caseSystems, users } from "@/db/schema";
import { withTenant, type Transaction } from "@/db/client";
import { can } from "@/server/authz";
import { writeAuditEvent } from "@/server/db/audit";
import { ForbiddenError, ValidationError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/require-auth";

/** The exception categories, verbatim from docs/04. */
export const EXCEPTION_CATEGORIES = [
  "Legal obligation — tax and accounting",
  "Establishment or defence of legal claims",
  "Fraud prevention",
  "Other documented exception",
] as const;
export type ExceptionCategory = (typeof EXCEPTION_CATEGORIES)[number];

export const CHECKLIST_STATUSES = [
  "Not started",
  "In progress",
  "Completed",
  "Not found",
  "Action required",
  "Retained under exception",
] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];

const MIN_REASON = 3;

export interface ChecklistSystemRow {
  sourceKey: string;
  name: string;
  status: ChecklistStatus;
  evidenceCount: number;
  searchMethod: string;
  reason: string;
  exceptionCategory: string | null;
  dueAt: Date | null;
  ownerName: string | null;
  updatedAt: Date;
}

function assertMayWorkCases(actor: Actor): void {
  if (!actor.roles.some((role) => can(role, "view_and_update_cases"))) {
    throw new ForbiddenError("Your role does not permit changing cases.");
  }
}

function selectSystemRows(tx: Transaction, caseId: string) {
  return tx
    .select({
      sourceKey: caseSystems.sourceKey,
      name: caseSystems.name,
      status: caseSystems.status,
      evidenceCount: caseSystems.evidenceCount,
      searchMethod: caseSystems.searchMethod,
      reason: caseSystems.reason,
      exceptionCategory: caseSystems.exceptionCategory,
      dueAt: caseSystems.dueAt,
      ownerName: users.name,
      ownerEmail: users.email,
      updatedAt: caseSystems.updatedAt,
    })
    .from(caseSystems)
    .leftJoin(users, eq(users.id, caseSystems.ownerId))
    .where(eq(caseSystems.caseId, caseId))
    .orderBy(asc(caseSystems.sourceKey));
}

export async function listCaseSystems(actor: Actor, caseId: string): Promise<ChecklistSystemRow[]> {
  assertMayWorkCases(actor);
  const rows = await withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    (tx) => selectSystemRows(tx, caseId),
  );
  return rows.map((r) => ({
    ...r,
    status: r.status as ChecklistStatus,
    ownerName: r.ownerName || r.ownerEmail,
  }));
}

export interface UpdateSystemStatusInput {
  sourceKey: string;
  status: string;
  reason?: string;
  exceptionCategory?: string;
}

export async function updateSystemStatus(
  actor: Actor,
  caseId: string,
  input: UpdateSystemStatusInput,
): Promise<ChecklistSystemRow> {
  assertMayWorkCases(actor);

  const status = input.status as ChecklistStatus;
  if (!CHECKLIST_STATUSES.includes(status)) {
    throw new ValidationError("unknown system status");
  }
  const reason = (input.reason ?? "").trim();
  if (reason.length < MIN_REASON) {
    throw new ValidationError("a reason is required to change a system's status");
  }
  const exCat = (input.exceptionCategory ?? "").trim() || null;
  if (status === "Retained under exception") {
    if (!exCat || !(EXCEPTION_CATEGORIES as readonly string[]).includes(exCat)) {
      throw new ValidationError("an exception category is required to retain a system under exception");
    }
  }

  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [row] = await tx
        .select({ id: caseSystems.id, name: caseSystems.name, status: caseSystems.status, evidenceCount: caseSystems.evidenceCount })
        .from(caseSystems)
        .where(and(eq(caseSystems.caseId, caseId), eq(caseSystems.sourceKey, input.sourceKey)))
        .limit(1);
      if (!row) throw new ValidationError("unknown system");

      if (status === "Completed" && row.evidenceCount < 1) {
        throw new ValidationError("Attach evidence before marking this system Completed.");
      }

      await tx
        .update(caseSystems)
        .set({
          status,
          reason,
          exceptionCategory: status === "Retained under exception" ? exCat : null,
          updatedAt: new Date(),
        })
        .where(eq(caseSystems.id, row.id));

      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: `System "${row.name || input.sourceKey}": ${row.status} → ${status}`,
        category: "Checklist",
        reason,
        objectType: "case",
        objectId: caseId,
        meta: { systemKey: input.sourceKey, from: row.status, to: status },
      });

      const [after] = await selectSystemRows(tx, caseId).then((rows) =>
        rows.filter((r) => r.sourceKey === input.sourceKey),
      );
      return { ...after!, status: after!.status as ChecklistStatus, ownerName: after!.ownerName || after!.ownerEmail };
    },
  );
}
