/**
 * G5 — customer-side support-access approval (docs/05 § Admin rules, non-negotiable #4).
 *
 * A Platform admin requests access (Requested); the customer OWNER approves (Active,
 * `expires_at = granted_at + 24h`) or declines (Declined, with a reason). An owner can
 * End an active grant early. Expiry is lazy: any Active grant past `expires_at` is read
 * as Expired. Approve/Decline/End are owner/workspace-admin actions and all write an
 * audit event in the same transaction.
 *
 * The staff-facing side (who may REQUEST a grant, and the enforcement that staff can only
 * see case data under an Active grant) belongs to the admin console slice, which carries
 * its own platform auth; no privileged handle is imported here.
 */
import { and, eq, lt } from "drizzle-orm";
import { supportGrants } from "@/db/schema";
import { withTenant, type Transaction } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";
import { now } from "@/server/time";
import { ForbiddenError, ValidationError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/require-auth";

const OWNER_ROLES = ["owner", "workspace_admin"];
export const SUPPORT_ACCESS_HOURS = 24;
export const MIN_REASON = 3;

function assertOwner(actor: Actor): void {
  if (!actor.roles.some((role) => OWNER_ROLES.includes(role))) {
    throw new ForbiddenError("Only an owner may decide support access.");
  }
}

async function readGrant(tx: Transaction, actor: Actor, grantId: string) {
  const [row] = await tx
    .select({
      id: supportGrants.id,
      status: supportGrants.status,
      expiresAt: supportGrants.expiresAt,
    })
    .from(supportGrants)
    .where(and(eq(supportGrants.id, grantId), eq(supportGrants.workspaceId, actor.workspaceId)))
    .limit(1);
  return row ?? null;
}

export interface SupportGrantView {
  id: string;
  staffLabel: string;
  scope: string;
  reason: string;
  status: string;
  requestedAt: Date;
  expiresAt: Date | null;
  declineReason: string | null;
}

export async function listSupportGrants(actor: Actor): Promise<SupportGrantView[]> {
  assertOwner(actor);

  return withTenant({ orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId }, async (tx) => {
    // Lazy expiry: an Active grant past expires_at is now Expired.
    await tx
      .update(supportGrants)
      .set({ status: "Expired" })
      .where(
        and(
          eq(supportGrants.workspaceId, actor.workspaceId),
          eq(supportGrants.status, "Active"),
          lt(supportGrants.expiresAt, now()),
        ),
      );

    const rows = await tx
      .select({
        id: supportGrants.id,
        staffLabel: supportGrants.staffLabel,
        scope: supportGrants.scope,
        reason: supportGrants.reason,
        status: supportGrants.status,
        requestedAt: supportGrants.requestedAt,
        expiresAt: supportGrants.expiresAt,
        declineReason: supportGrants.declineReason,
      })
      .from(supportGrants)
      .where(eq(supportGrants.workspaceId, actor.workspaceId))
      .orderBy(supportGrants.requestedAt);

    return rows;
  });
}

export async function approveSupportAccess(actor: Actor, grantId: string, reason: string): Promise<void> {
  assertOwner(actor);
  const r = reason.trim();
  if (r.length < MIN_REASON) throw new ValidationError("a reason is required to approve support access");

  return withTenant({ orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId }, async (tx) => {
    const row = await readGrant(tx, actor, grantId);
    if (!row) throw new ValidationError("unknown support grant");
    if (row.status !== "Requested") throw new ValidationError("only a requested grant can be approved");

    const grantedAt = now();
    await tx
      .update(supportGrants)
      .set({
        status: "Active",
        grantedAt,
        expiresAt: new Date(grantedAt.getTime() + SUPPORT_ACCESS_HOURS * 60 * 60 * 1000),
      })
      .where(eq(supportGrants.id, grantId));
    await writeAuditEvent(tx, {
      orgId: actor.orgId,
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      actorLabel: actor.label,
      action: "Support access approved",
      category: "Access",
      reason: r,
      objectType: "support_grant",
      objectId: grantId,
    });
  });
}

export async function declineSupportAccess(actor: Actor, grantId: string, reason: string): Promise<void> {
  assertOwner(actor);
  const r = reason.trim();
  if (r.length < MIN_REASON) throw new ValidationError("a reason is required to decline support access");

  return withTenant({ orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId }, async (tx) => {
    const row = await readGrant(tx, actor, grantId);
    if (!row) throw new ValidationError("unknown support grant");
    if (row.status !== "Requested") throw new ValidationError("only a requested grant can be declined");

    await tx
      .update(supportGrants)
      .set({ status: "Declined", declinedAt: now(), declineReason: r })
      .where(eq(supportGrants.id, grantId));
    await writeAuditEvent(tx, {
      orgId: actor.orgId,
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      actorLabel: actor.label,
      action: "Support access declined",
      category: "Access",
      reason: r,
      objectType: "support_grant",
      objectId: grantId,
    });
  });
}

export async function endSupportAccess(actor: Actor, grantId: string, reason: string): Promise<void> {
  assertOwner(actor);
  const r = reason.trim();
  if (r.length < MIN_REASON) throw new ValidationError("a reason is required to end support access");

  return withTenant({ orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId }, async (tx) => {
    const row = await readGrant(tx, actor, grantId);
    if (!row) throw new ValidationError("unknown support grant");
    if (row.status !== "Active") throw new ValidationError("only an active grant can be ended");

    await tx.update(supportGrants).set({ status: "Ended", endedAt: now() }).where(eq(supportGrants.id, grantId));
    await writeAuditEvent(tx, {
      orgId: actor.orgId,
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      actorLabel: actor.label,
      action: "Support access ended",
      category: "Access",
      reason: r,
      objectType: "support_grant",
      objectId: grantId,
    });
  });
}
