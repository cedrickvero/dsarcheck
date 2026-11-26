/**
 * POST /api/track/verify - redeem the 6-digit code and start a requester session.
 *
 * The code is scoped to the workspace the requester reached us on (Host), so the same code
 * in another workspace cannot collide. Redemption is IP-rate-limited: a 6-digit code is only
 * ~20 bits, so an unlimited endpoint would let an attacker brute-force a victim's code inside
 * the 15-minute window and take over their request list. Wrong/expired/replayed/throttled
 * attempts all redirect to the generic "check your email" state with a non-disclosing flag.
 */
import { NextResponse } from "next/server";
import { withTenant } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";
import { route } from "@/server/http/handler";
import { RateLimitError } from "@/server/http/errors";
import { logError } from "@/server/log";
import { enforceRateLimit, bucketKey } from "@/server/auth/rate-limit";
import { env } from "@/env";
import { resolvePortalByHost } from "@/server/portal/resolve";
import { createRequesterSession, redeemSignInCode, requesterCookieName } from "@/server/portal/requester";

function originFrom(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${forwardedProto === "https" ? "https" : "http"}://${host}`;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "unknown";
}

export const POST = route(async (req, ctx) => {
  const portal = await resolvePortalByHost(req.headers.get("host"));
  if (!portal) return new NextResponse("Not found", { status: 404 });

  const origin = originFrom(req);
  const ip = clientIp(req);
  const form = await req.formData();
  const code = String(form.get("code") ?? "").trim();

  let redeemed: Awaited<ReturnType<typeof redeemSignInCode>> = null;
  try {
    redeemed = await withTenant({ orgId: portal.orgId, workspaceId: portal.workspaceId, actorId: "requester" }, async (tx) => {
      await enforceRateLimit(tx, {
        bucketKey: bucketKey(["ip", ip]),
        scope: "requester_sign_in_redeem",
        limit: env.RATE_LIMIT_REDEEM_PER_HOUR,
        windowSeconds: 3600,
        workspaceId: portal.workspaceId,
      });
      return redeemSignInCode(tx, code);
    });
  } catch (err) {
    // Throttling must not disclose whether the code was right: a throttled attempt and a
    // wrong code both land on the same generic "check your email" state.
    if (!(err instanceof RateLimitError)) throw err;
    logError("requester-sign-in-redeem.throttled", err, { requestId: ctx.requestId });
  }

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
