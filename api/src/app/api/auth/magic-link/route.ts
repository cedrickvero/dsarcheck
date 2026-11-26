/**
 * POST /api/auth/magic-link - request a sign-in link.
 *
 * THE RESPONSE IS ALWAYS THE SAME: whether the address exists, whether it is disabled,
 * and whether it is rate-limited all return an identical 200. That is the only way the
 * endpoint cannot be used to enumerate accounts.
 *
 * Runs in withLookup({ emailHash }): no tenant is set, so RLS exposes exactly the one
 * user row whose email hash was presented. The rate-limit row is written in the same
 * transaction as the link.
 */
import { NextResponse } from "next/server";
import { withLookup } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";
import { env } from "@/env";
import { rateLimitHits } from "@/db/schema";
import { route } from "@/server/http/handler";
import { RateLimitError, ValidationError } from "@/server/http/errors";
import { logError } from "@/server/log";
import { hashEmail, hashToken, normaliseEmail } from "@/server/auth/crypto";
import { issueLink } from "@/server/auth/magic-link";
import { enforceRateLimit, bucketKey } from "@/server/auth/rate-limit";

const GENERIC = { ok: true, message: "If that address has an account, a sign-in link is on its way." };

export const POST = route(async (req, ctx) => {
  // The origin must be the address the requester actually reached us on, not the server's
  // listen host: Next reconstructs req.url from `next dev -H 0.0.0.0`, which yields
  // http://0.0.0.0:3000 - a bind address that is not dialable from the requester's browser.
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const origin = `${forwardedProto === "https" ? "https" : "http"}://${host}`;

  // Accept both a JSON API call and a plain HTML form post (the sign-in page posts without
  // JavaScript as a fallback, so the request can never be gated on hydration succeeding).
  const contentType = req.headers.get("content-type") ?? "";
  const isFormPost = contentType.includes("application/x-www-form-urlencoded");
  const body = isFormPost
    ? Object.fromEntries(new URLSearchParams(await req.text().catch(() => "")))
    : ((await req.json().catch(() => ({}))) as { email?: unknown });

  if (typeof body.email !== "string" || body.email.trim() === "") {
    throw new ValidationError("an email address is required");
  }
  const email = normaliseEmail(body.email);

  let issued: Awaited<ReturnType<typeof issueLink>> | null = null;
  try {
    issued = await withLookup({ emailHash: hashEmail(email) }, async (tx) => {
      await enforceRateLimit(tx, {
        bucketKey: bucketKey([hashEmail(email)]),
        scope: "magic_link_request",
        limit: env.RATE_LIMIT_MAGIC_LINK_PER_HOUR,
        windowSeconds: 3600,
        workspaceId: null,
      });

      const result = await issueLink(tx, email, origin);
      if (result.userId && result.orgId && result.workspaceId) {
        await writeAuditEvent(tx, {
          orgId: result.orgId,
          workspaceId: result.workspaceId,
          actorId: result.userId,
          actorLabel: email,
          action: "auth.magic_link.requested",
          category: "authentication",
          reason: "Sign-in link requested",
          objectType: "magic_link",
          objectId: null,
          // Deliberately no token, no token hash and no URL: the audit trail must never
          // become a way to obtain a credential.
          meta: { deliveryRequested: true },
        });
      }
      return result;
    });
  } catch (err) {
    // Throttling must not become an account-enumeration oracle: a rate-limited request
    // returns the SAME generic 200 as an unknown email. Throttling stays applied
    // server-side; the hit is security-logged with the hashed bucket only, never the raw
    // address or any clue to whether the account exists.
    if (!(err instanceof RateLimitError)) throw err;
    logError("magic-link.throttled", err, { requestId: ctx.requestId, emailHash: hashEmail(email) });
  }

  // The link is "sent" by returning it to the mailer. In development it is logged to
  // MailHog; the raw token is never returned to the HTTP caller.
  if (issued?.url) {
    const { sendSignInLink } = await import("@/server/auth/mailer");
    await sendSignInLink(email, issued.url).catch(() => undefined);
  }

  // A browser form gets a redirect to the "check your email" state; an API caller gets the
  // generic JSON. Both paths leak the same amount: nothing.
  if (isFormPost) {
    return NextResponse.redirect(new URL("/?sent=1", origin), 303);
  }
  return NextResponse.json(GENERIC, { status: 200 });
});
