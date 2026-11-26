/**
 * The active-workspace switcher (docs/03 § A.2). An agency user belongs to their home
 * workspace (`users.workspace_id`) plus a set of client workspaces (`memberships`, each
 * with a per-workspace role). The ACTIVE workspace is the session's `workspace_id`; the
 * role the actor holds in it comes from the membership row (falling back to the home
 * role). Switching rotates the session into the target workspace and writes an immutable
 * audit event in the target.
 *
 * Tenant isolation: reachable workspaces are read from the org-scoped `memberships`
 * table (denormalised `workspace_name`, since `workspaces` RLS hides siblings) and the
 * user's own home workspace (self-scoped `workspaces` read). A target that is neither
 * the home nor an active membership is refused — fail closed.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { memberships, orgs, sessions, users, workspaces } from "@/db/schema";
import { withTenant } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";
import { ForbiddenError } from "@/server/http/errors";
import { createSession, revokeSession } from "@/server/auth/session-store";
import type { Actor, Role } from "@/server/auth/require-auth";

export interface ReachableWorkspace {
  workspaceId: string;
  name: string;
  role: Role;
  isCurrent: boolean;
}

export interface WorkspaceSwitchContext {
  orgId: string;
  orgName: string;
  orgKind: "agency" | "direct";
  currentWorkspaceId: string;
  workspaces: ReachableWorkspace[];
}

/** The workspaces an actor may reach: their home workspace plus their active memberships. */
export async function listReachableWorkspaces(actor: Actor): Promise<WorkspaceSwitchContext> {
  const base = await withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [org] = await tx.select({ name: orgs.name, kind: orgs.kind }).from(orgs).where(eq(orgs.id, actor.orgId)).limit(1);
      const [u] = await tx
        .select({ homeWorkspaceId: users.workspaceId, homeRole: users.role })
        .from(users)
        .where(eq(users.id, actor.userId))
        .limit(1);
      const members = await tx
        .select({ workspaceId: memberships.workspaceId, name: memberships.workspaceName, role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, actor.userId), eq(memberships.active, true)))
        .orderBy(asc(memberships.workspaceName));
      return {
        orgName: org?.name ?? "",
        orgKind: (org?.kind ?? "direct") as "agency" | "direct",
        homeWorkspaceId: u?.homeWorkspaceId ?? actor.workspaceId,
        homeRole: (u?.homeRole ?? actor.roles[0] ?? "request_handler") as Role,
        members,
      };
    },
  );

  // The home workspace's name comes from a self-scoped workspaces read under its own
  // tenant — its RLS returns exactly the home row.
  const homeName = await withTenant(
    { orgId: actor.orgId, workspaceId: base.homeWorkspaceId, actorId: actor.userId },
    async (tx) => {
      const [w] = await tx.select({ name: workspaces.name }).from(workspaces).limit(1);
      return w?.name ?? "";
    },
  );

  const list: ReachableWorkspace[] = [
    { workspaceId: base.homeWorkspaceId, name: homeName, role: base.homeRole, isCurrent: base.homeWorkspaceId === actor.workspaceId },
  ];
  for (const m of base.members) {
    if (m.workspaceId === base.homeWorkspaceId) continue;
    list.push({
      workspaceId: m.workspaceId,
      name: m.name,
      role: m.role as Role,
      isCurrent: m.workspaceId === actor.workspaceId,
    });
  }

  return {
    orgId: actor.orgId,
    orgName: base.orgName,
    orgKind: base.orgKind,
    currentWorkspaceId: actor.workspaceId,
    workspaces: list,
  };
}

/**
 * Switch the actor's active workspace. The session is ROTATED (revoked + reissued in the
 * target tenant) so no live token silently changes tenant; MFA satisfaction is carried
 * forward because the user has already authenticated. The audit is written in the TARGET
 * workspace (the tenant the actor is entering).
 */
export async function switchWorkspace(actor: Actor, targetWorkspaceId: string): Promise<{ token: string }> {
  if (!actor.sessionId) throw new ForbiddenError("No session to switch.");

  const context = await listReachableWorkspaces(actor);
  const target = context.workspaces.find((w) => w.workspaceId === targetWorkspaceId);
  if (!target) throw new ForbiddenError("You do not have access to that workspace.");

  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      // TOCTOU re-check: re-verify reachability inside the transaction that rotates the
      // session, so a membership deactivated between the listReachableWorkspaces read and
      // this transaction cannot switch. The org-scoped memberships RLS already bounds the
      // row to the actor's own org; this bounds it to an ACTIVE membership of the actor.
      const [home] = await tx.select({ workspaceId: users.workspaceId }).from(users).where(eq(users.id, actor.userId)).limit(1);
      const isHome = home?.workspaceId === targetWorkspaceId;
      const [membership] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.userId, actor.userId), eq(memberships.workspaceId, targetWorkspaceId), eq(memberships.active, true)))
        .limit(1);
      if (!isHome && !membership) throw new ForbiddenError("You do not have access to that workspace.");

      const [old] = await tx
        .select({ mfa: sessions.mfaSatisfiedAt })
        .from(sessions)
        .where(eq(sessions.id, actor.sessionId!))
        .limit(1);
      const mfaSatisfiedAt = old?.mfa ?? null;

      // Revoke the current session (in the source tenant).
      await revokeSession(tx, actor.sessionId!);

      // Re-scope the transaction-local tenant to the target, then reissue the session and
      // write the audit there — the sessions/audit WITH CHECK both require the target GUC.
      await tx.execute(sql`select set_config('app.workspace_id', ${targetWorkspaceId}, true)`);
      const created = await createSession(tx, {
        userId: actor.userId,
        orgId: actor.orgId,
        workspaceId: targetWorkspaceId,
        mfaSatisfiedAt,
      });

      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: targetWorkspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: "Active workspace changed",
        category: "Access",
        reason: `Switched to ${target.name}`,
        objectType: "workspace",
        objectId: targetWorkspaceId,
        meta: { fromWorkspaceId: actor.workspaceId, workspaceName: target.name },
      });

      return { token: created.token };
    },
  );
}
