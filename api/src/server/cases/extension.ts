/**
 * G15 — the deadline-extension flow with the "approver reviews extensions" gate
 * (docs/05 § Extension, docs/03 § E header).
 *
 * A handler requests +1 or +2 months (max 2 total). When the workspace setting
 * `approverReviewsExtensions` is OFF (default) the extension applies immediately: status
 * Extended + extensionMonths + the "Extend deadline" audit. When ON, the request stores
 * `extensionRequestedMonths` (a pending sub-state) and an Approver must approve (applies it)
 * or reject (clears it). The "We need more time" outbound email is part of the G3
 * transactional-emails slice and is deferred here (the audit is still written).
 */
import { and, eq } from "drizzle-orm";
import { cases, workspaces } from "@/db/schema";
import { withTenant, type Transaction } from "@/db/client";
import { can } from "@/server/authz";
import { writeAuditEvent } from "@/server/db/audit";
import { ForbiddenError, ValidationError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/require-auth";

const APPROVER_ROLES = ["owner", "workspace_admin", "approver"];
const MIN_REASON = 3;

function assertMayRequestExtension(actor: Actor): void {
  if (!actor.roles.some((role) => can(role, "view_and_update_cases"))) {
    throw new ForbiddenError("Your role does not permit extending a deadline.");
  }
}

function assertApprover(actor: Actor): void {
  if (!actor.roles.some((role) => APPROVER_ROLES.includes(role))) {
    throw new ForbiddenError("Only an approver may decide an extension.");
  }
}

async function readCase(tx: Transaction, actor: Actor, caseId: string) {
  const [row] = await tx
    .select({
      id: cases.id,
      status: cases.status,
      extensionMonths: cases.extensionMonths,
      extensionRequestedMonths: cases.extensionRequestedMonths,
    })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function requestExtension(
  actor: Actor,
  caseId: string,
  months: number,
  reason: string,
): Promise<{ pending: boolean }> {
  assertMayRequestExtension(actor);
  if (months !== 1 && months !== 2) throw new ValidationError("extend by 1 or 2 months");
  const r = reason.trim();
  if (r.length < MIN_REASON) throw new ValidationError("a reason is required for an extension");

  return withTenant({ orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId }, async (tx) => {
    const row = await readCase(tx, actor, caseId);
    if (!row) throw new ValidationError("unknown case");
    if (row.status === "Completed" || row.status === "Rejected") {
      throw new ValidationError("a closed case cannot be extended");
    }
    if (row.extensionMonths + (row.extensionRequestedMonths ?? 0) + months > 2) {
      throw new ValidationError("the deadline can be extended by 2 months at most");
    }

    const [ws] = await tx
      .select({ approverReviewsExtensions: workspaces.approverReviewsExtensions })
      .from(workspaces)
      .where(eq(workspaces.id, actor.workspaceId))
      .limit(1);

    if (ws?.approverReviewsExtensions) {
      await tx.update(cases).set({ extensionRequestedMonths: months }).where(eq(cases.id, caseId));
      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: "Extension requested",
        category: "SLA",
        reason: r,
        objectType: "case",
        objectId: caseId,
        meta: { months },
      });
      return { pending: true };
    }

    await tx
      .update(cases)
      .set({ status: "Extended", extensionMonths: row.extensionMonths + months })
      .where(eq(cases.id, caseId));
    await writeAuditEvent(tx, {
      orgId: actor.orgId,
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      actorLabel: actor.label,
      action: "Extend deadline",
      category: "SLA",
      reason: r,
      objectType: "case",
      objectId: caseId,
      meta: { months },
    });
    return { pending: false };
  });
}

export async function approveExtension(actor: Actor, caseId: string, reason: string): Promise<void> {
  assertApprover(actor);
  const r = reason.trim();
  if (r.length < MIN_REASON) throw new ValidationError("a reason is required to approve an extension");

  return withTenant({ orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId }, async (tx) => {
    const row = await readCase(tx, actor, caseId);
    if (!row) throw new ValidationError("unknown case");
    if (!row.extensionRequestedMonths) throw new ValidationError("no extension is awaiting approval");

    await tx
      .update(cases)
      .set({
        status: "Extended",
        extensionMonths: row.extensionMonths + row.extensionRequestedMonths,
        extensionRequestedMonths: null,
      })
      .where(eq(cases.id, caseId));
    await writeAuditEvent(tx, {
      orgId: actor.orgId,
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      actorLabel: actor.label,
      action: "Extension approved",
      category: "SLA",
      reason: r,
      objectType: "case",
      objectId: caseId,
      meta: { months: row.extensionRequestedMonths },
    });
  });
}

export async function rejectExtension(actor: Actor, caseId: string, reason: string): Promise<void> {
  assertApprover(actor);
  const r = reason.trim();
  if (r.length < MIN_REASON) throw new ValidationError("a reason is required to reject an extension");

  return withTenant({ orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId }, async (tx) => {
    const row = await readCase(tx, actor, caseId);
    if (!row) throw new ValidationError("unknown case");
    if (!row.extensionRequestedMonths) throw new ValidationError("no extension is awaiting approval");

    await tx.update(cases).set({ extensionRequestedMonths: null }).where(eq(cases.id, caseId));
    await writeAuditEvent(tx, {
      orgId: actor.orgId,
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      actorLabel: actor.label,
      action: "Extension rejected",
      category: "SLA",
      reason: r,
      objectType: "case",
      objectId: caseId,
      meta: { months: row.extensionRequestedMonths },
    });
  });
}
