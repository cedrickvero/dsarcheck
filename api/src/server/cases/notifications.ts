/**
 * Notifications: derivation plus read marks. Server-only.
 *
 * The list is DERIVED on every read from open cases (see domain/notifications.ts) and is
 * never stored; only the per-user read mark is persisted, keyed by `caseId + kind`. Marking
 * read is an idempotent upsert, so there is no delete and no way to lose a mark.
 */
import { and, desc, eq } from "drizzle-orm";
import { auditEvents, cases, caseSystems, notificationReads } from "@/db/schema";
import { withTenant } from "@/db/client";
import { can } from "@/server/authz";
import { ForbiddenError, ValidationError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/require-auth";
import {
  deriveNotifications,
  type DerivedNotification,
  type NotificationCase,
} from "@/domain/notifications";

/**
 * Which of the two lists an actor sees. The prototype's Handler/Approver toggle maps onto
 * role names, not the permission matrix: `approver` also holds `view_and_update_cases`, so
 * deriving "the handler list for anyone who can view cases" would hand an approver the
 * handler's queue. An owner or workspace admin holds BOTH hats and sees both lists.
 */
const HANDLER_ROLES = ["owner", "workspace_admin", "request_handler", "system_owner"];
const APPROVER_ROLES = ["owner", "workspace_admin", "approver"];

function rolesFor(actor: Actor): { handler: boolean; approver: boolean } {
  return {
    handler: actor.roles.some((role) => HANDLER_ROLES.includes(role)),
    approver: actor.roles.some((role) => APPROVER_ROLES.includes(role)),
  };
}

export interface NotificationFeed {
  notifications: DerivedNotification[];
  unread: number;
}

export async function listNotifications(actor: Actor, now: Date): Promise<NotificationFeed> {
  if (!actor.roles.some((role) => can(role, "view_and_update_cases"))) {
    throw new ForbiddenError("Your role does not permit viewing notifications.");
  }

  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const base = await tx
        .select({
          id: cases.id,
          caseNumber: cases.caseNumber,
          requestType: cases.requestType,
          status: cases.status,
          risk: cases.risk,
          requesterName: cases.requesterName,
          receivedAt: cases.receivedAt,
          extensionMonths: cases.extensionMonths,
          closedAt: cases.closedAt,
        })
        .from(cases)
        .where(eq(cases.workspaceId, actor.workspaceId));

      const actionSystems = await tx
        .select({ caseId: caseSystems.caseId, key: caseSystems.sourceKey, name: caseSystems.name })
        .from(caseSystems)
        .where(
          and(
            eq(caseSystems.workspaceId, actor.workspaceId),
            eq(caseSystems.status, "Action required"),
          ),
        );

      // Latest audit action per case, for the "Changes requested" notification.
      const lastAudit = await tx
        .selectDistinctOn([auditEvents.objectId], {
          objectId: auditEvents.objectId,
          action: auditEvents.action,
          reason: auditEvents.reason,
        })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.workspaceId, actor.workspaceId),
            eq(auditEvents.objectType, "case"),
          ),
        )
        .orderBy(auditEvents.objectId, desc(auditEvents.at));

      const auditByCaseId = new Map(
        lastAudit.map((row) => [row.objectId, { action: row.action, reason: row.reason }] as const),
      );
      const systemsByCaseId = new Map<string, { key: string; name: string }[]>();
      for (const system of actionSystems) {
        const list = systemsByCaseId.get(system.caseId) ?? [];
        list.push({ key: system.key, name: system.name });
        systemsByCaseId.set(system.caseId, list);
      }

      const sourceNames: Record<string, string> = {};
      for (const system of actionSystems) {
        if (system.name) sourceNames[system.key] = system.name;
      }

      const readRows = await tx
        .select({ notificationKey: notificationReads.notificationKey })
        .from(notificationReads)
        .where(eq(notificationReads.userId, actor.userId));
      const read = Object.fromEntries(readRows.map((row) => [row.notificationKey, true]));

      const notificationCases: NotificationCase[] = base.map((row) => ({
        id: row.caseNumber,
        type: row.requestType,
        status: row.status,
        risk: row.risk,
        name: row.requesterName,
        receivedAt: row.receivedAt,
        extensionMonths: row.extensionMonths as 0 | 1 | 2,
        closedAt: row.closedAt,
        systems: (systemsByCaseId.get(row.id) ?? []).map((system) => ({
          key: system.key,
          status: "Action required",
        })),
        lastAuditAction: auditByCaseId.get(row.id)?.action,
        lastAuditReason: auditByCaseId.get(row.id)?.reason,
      }));

      const { handler, approver } = rolesFor(actor);
      const feeds: DerivedNotification[] = [];
      if (handler) {
        feeds.push(...deriveNotifications({ role: "Handler", cases: notificationCases, now, sourceNames, read }));
      }
      if (approver) {
        feeds.push(...deriveNotifications({ role: "Approver", cases: notificationCases, now, sourceNames, read }));
      }
      // The two lists do not overlap today, but a future shared kind must not count twice.
      const seen = new Set<string>();
      const notifications = feeds.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));

      return { notifications, unread: notifications.filter((n) => n.unread).length };
    },
  );
}

/** Mark one notification read. Idempotent: re-marking the same key is a no-op. */
export async function markNotificationRead(actor: Actor, notificationKey: string): Promise<void> {
  // A client may send any key; only a key this actor actually sees is a valid mark (L-5).
  const feed = await listNotifications(actor, new Date());
  if (!feed.notifications.some((n) => n.id === notificationKey)) {
    throw new ValidationError("unknown notification");
  }
  await withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      await tx
        .insert(notificationReads)
        .values({
          orgId: actor.orgId,
          workspaceId: actor.workspaceId,
          userId: actor.userId,
          notificationKey,
        })
        .onConflictDoNothing({ target: [notificationReads.userId, notificationReads.notificationKey] });
    },
  );
}

/** Mark every currently-derived notification read, in one transaction. */
export async function markAllNotificationsRead(actor: Actor, now: Date): Promise<void> {
  const feed = await listNotifications(actor, now);
  await withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      await tx
        .insert(notificationReads)
        .values(
          feed.notifications.map((n) => ({
            orgId: actor.orgId,
            workspaceId: actor.workspaceId,
            userId: actor.userId,
            notificationKey: n.id,
          })),
        )
        .onConflictDoNothing({ target: [notificationReads.userId, notificationReads.notificationKey] });
    },
  );
}
