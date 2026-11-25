/**
 * GET /api/auth/callback?token=... - redeem a sign-in link.
 *
 * Atomic single use: redemption is UPDATE ... WHERE used_at IS NULL, so a replayed
 * link finds nothing. Runs in withLookup({ magicTokenHash }), where the only visible
 * row is the one whose hash matches the presented token.
 *
 * A session is created here. If the user's role requires MFA it is NOT yet usable -
 * requireAuth refuses it until /api/auth/totp/verify succeeds. The cookie is set with
 * the R3 policy: HttpOnly, Secure in production, SameSite=Lax, __Host- in production.
 */
import { NextResponse } from "next/server";
import { withLookup } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";
import { route } from "@/server/http/handler";
import { UnauthenticatedError } from "@/server/http/errors";
import { requiresMfa } from "@/server/authz";
import type { Role } from "@/server/auth/require-auth";
import { sql } from "drizzle-orm";
import { users } from "@/db/schema";
import { createSession } from "@/server/auth/session-store";
import { redeemLink } from "@/server/auth/magic-link";
import { sessionCookieName } from "@/server/auth/require-auth";
import { hashToken } from "@/server/auth/crypto";
import { enforceRateLimit, bucketKey } from "@/server/auth/rate-limit";
import { env } from "@/env";

export const GET = route(async (req) => {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) throw new UnauthenticatedError();
  const tokenHash = hashToken(token);

  const result = await withLookup({ magicTokenHash: tokenHash }, async (tx) => {
    // HIGH-2: the declared redeem limit was never enforced.
    await enforceRateLimit(tx, {
      bucketKey: bucketKey([tokenHash]),
      scope: "magic_link_redeem",
      limit: env.RATE_LIMIT_REDEEM_PER_HOUR,
      windowSeconds: 3600,
      workspaceId: null,
    });

    const link = await redeemLink(tx, token);
    if (!link) return null;

    // Learn the tenant from the redeemed link, then read the role - so mfaRequired is
    // accurate rather than assumed.
    await tx.execute(sql`select set_config('app.workspace_id', ${link.workspaceId}, true)`);
    const [user] = await tx.select().from(users).where(sql`${users.id} = ${link.userId}`).limit(1);

    const created = await createSession(tx, {
      userId: link.userId,
      orgId: link.orgId,
      workspaceId: link.workspaceId,
    });

    await writeAuditEvent(tx, {
      orgId: link.orgId,
      workspaceId: link.workspaceId,
      actorId: link.userId,
      actorLabel: "session",
      action: "auth.sign_in",
      category: "authentication",
      reason: "Magic link redeemed",
      objectType: "session",
      objectId: created.sessionId,
      meta: { mfaOutstanding: requiresMfa((user?.role ?? "request_handler") as Role) },
    });
    return { created, mfaRequired: requiresMfa((user?.role ?? "request_handler") as Role) };
  });

  if (!result) throw new UnauthenticatedError();

  const production = process.env.NODE_ENV === "production";

  // A browser click gets a redirect into the app; an API caller gets the JSON. Both set the
  // session cookie. If the role still owes MFA, /app renders the MFA-required panel instead
  // of case content - so one destination works for both.
  const accept = req.headers.get("accept") ?? "";
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const origin = `${forwardedProto === "https" ? "https" : "http"}://${host}`;

  const res = accept.includes("text/html")
    ? NextResponse.redirect(new URL("/app", origin), 303)
    : NextResponse.json({ ok: true, mfaRequired: result.mfaRequired });

  res.cookies.set(sessionCookieName(), result.created.token, {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  return res;
});
