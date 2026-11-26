/**
 * POST /api/track/verify - redeem the 6-digit code and start a requester session.
 *
 * The code is scoped to the workspace the requester reached us on (Host), so the same code
 * in another workspace cannot collide. Wrong/expired/replayed codes redirect to the generic
 * "check your email" state with a non-disclosing flag.
 */
import { NextResponse } from "next/server";
import { withTenant } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";
import { route } from "@/server/http/handler";
import { resolvePortalByHost } from "@/server/portal/resolve";
import { createRequesterSession, redeemSignInCode, requesterCookieName } from "@/server/portal/requester";

function originFrom(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${forwardedProto === "https" ? "https" : "http"}://${host}`;
}

export const POST = route(async (req) => {
  const portal = await resolvePortalByHost(req.headers.get("host"));
  if (!portal) return new NextResponse("Not found", { status: 404 });

  const origin = originFrom(req);
  const form = await req.formData();
  const code = String(form.get("code") ?? "").trim();

  const redeemed = await withTenant(
    { orgId: portal.orgId, workspaceId: portal.workspaceId, actorId: "requester" },
    (tx) => redeemSignInCode(tx, code),
  );

  if (!redeemed) {
    return NextResponse.redirect(new URL("/track?sent=1&code=1", origin), 303);
  }

  const { token } = await withTenant(
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
        reason: "Requester sign-in code redeemed",
        objectType: "requester_session",
        objectId: null,
        meta: {},
      });
      return created;
    },
  );

  const res = NextResponse.redirect(new URL("/track/requests", origin), 303);
  res.cookies.set(requesterCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  return res;
});
