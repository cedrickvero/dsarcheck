/**
 * GET /api/track/callback?token=... - redeem the sign-in link and start a requester session.
 *
 * Atomic single use via UPDATE ... WHERE used_at IS NULL. Runs in withLookup({
 * requesterTokenHash }) where the only visible row is the one whose hash matches the
 * presented token, so a replayed or forged link finds nothing.
 */
import { NextResponse } from "next/server";
import { withLookup, withTenant } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";
import { route } from "@/server/http/handler";
import { hashToken } from "@/server/auth/crypto";
import { createRequesterSession, redeemSignInLink, requesterCookieName } from "@/server/portal/requester";

function originFrom(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${forwardedProto === "https" ? "https" : "http"}://${host}`;
}

export const GET = route(async (req) => {
  const origin = originFrom(req);
  const token = new URL(req.url).searchParams.get("token") ?? "";

  const redeemed = await withLookup({ requesterTokenHash: hashToken(token) }, (tx) => redeemSignInLink(tx, token));
  if (!redeemed) {
    return NextResponse.redirect(new URL("/track?sent=1", origin), 303);
  }

  const { token: sessionToken } = await withTenant(
    { orgId: redeemed.orgId, workspaceId: redeemed.workspaceId, actorId: "requester" },
    async (tx) => {
      const created = await createRequesterSession(tx, { orgId: redeemed.orgId, workspaceId: redeemed.workspaceId }, redeemed.email);
      await writeAuditEvent(tx, {
        orgId: redeemed.orgId,
        workspaceId: redeemed.workspaceId,
        actorId: "requester",
        actorLabel: redeemed.email,
        action: "requester.sign_in",
        category: "authentication",
        reason: "Requester sign-in link redeemed",
        objectType: "requester_session",
        objectId: null,
        meta: {},
      });
      return created;
    },
  );

  const res = NextResponse.redirect(new URL("/track/requests", origin), 303);
  res.cookies.set(requesterCookieName(), sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  return res;
});
