/**
 * POST /api/auth/sign-out - revoke the current session and clear the cookie.
 *
 * Revocation is an UPDATE (revoked_at), never a DELETE: the app role holds no DELETE on
 * any table. The audit event is written in the same transaction as the revocation.
 */
import { NextResponse } from "next/server";
import { withTenant } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";
import { route } from "@/server/http/handler";
import { requireAuthFromRequest, sessionCookieName } from "@/server/auth/require-auth";
import { revokeSession } from "@/server/auth/session-store";

export const POST = route(async (req) => {
  const actor = await requireAuthFromRequest(req);

  await withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      if (actor.sessionId) await revokeSession(tx, actor.sessionId);
      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: "auth.session.revoked",
        category: "authentication",
        reason: "Signed out",
        objectType: "session",
        objectId: actor.sessionId ?? null,
        meta: {},
      });
    },
  );

  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieName(), "", { path: "/", maxAge: 0, httpOnly: true });
  return res;
});
