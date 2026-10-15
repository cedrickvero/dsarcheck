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
import { ValidationError } from "@/server/http/errors";
import { hashEmail, hashToken, normaliseEmail } from "@/server/auth/crypto";
import { issueLink } from "@/server/auth/magic-link";
import { enforceRateLimit, bucketKey } from "@/server/auth/rate-limit";

const GENERIC = { ok: true, message: "If that address has an account, a sign-in link is on its way." };

export const POST = route(async (req) => {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  if (typeof body.email !== "string" || body.email.trim() === "") {
    throw new ValidationError("an email address is required");
  }
  const email = normaliseEmail(body.email);

  const issued = await withLookup({ emailHash: hashEmail(email) }, async (tx) => {
    await enforceRateLimit(tx, {
      bucketKey: bucketKey([hashEmail(email)]),
      scope: "magic_link_request",
      limit: env.RATE_LIMIT_MAGIC_LINK_PER_HOUR,
      windowSeconds: 3600,
      workspaceId: null,
    });

    const result = await issueLink(tx, email, new URL(req.url).origin);
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

  // The link is "sent" by returning it to the mailer. In development it is logged to
  // MailHog; the raw token is never returned to the HTTP caller.
  if (issued.url) {
    const { sendSignInLink } = await import("@/server/auth/mailer");
    await sendSignInLink(email, issued.url).catch(() => undefined);
  }
  return NextResponse.json(GENERIC, { status: 200 });
});
