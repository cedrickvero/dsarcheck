/**
 * POST /api/track/request - request a requester sign-in link + 6-digit code.
 *
 * The workspace comes from the Host (never the body). The response is IDENTICAL whether
 * the address has requests, is rate-limited, or the host is unknown (unknown host is a
 * bare 404 like the intake). That is the only way the endpoint cannot enumerate requesters.
 */
import { NextResponse } from "next/server";
import { withTenant } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";
import { route } from "@/server/http/handler";
import { RateLimitError } from "@/server/http/errors";
import { logError } from "@/server/log";
import { hashEmail } from "@/server/auth/crypto";
import { enforceRateLimit, bucketKey } from "@/server/auth/rate-limit";
import { env } from "@/env";
import { resolvePortalByHost } from "@/server/portal/resolve";
import { requestSignInCredential } from "@/server/portal/requester";

function originFrom(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${forwardedProto === "https" ? "https" : "http"}://${host}`;
}

export const POST = route(async (req, ctx) => {
  const portal = await resolvePortalByHost(req.headers.get("host"));
  if (!portal) return new NextResponse("Not found", { status: 404 });

  const origin = originFrom(req);
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim();
  if (!email) {
    return NextResponse.redirect(new URL("/track?sent=1", origin), 303);
  }
  let issued: { email: string; url: string; code: string } | null = null;
  try {
    issued = await withTenant({ orgId: portal.orgId, workspaceId: portal.workspaceId, actorId: "requester" }, async (tx) => {
      await enforceRateLimit(tx, {
        bucketKey: bucketKey([hashEmail(email)]),
        scope: "requester_sign_in_request",
        limit: env.RATE_LIMIT_MAGIC_LINK_PER_HOUR,
        windowSeconds: 3600,
        workspaceId: portal.workspaceId,
      });

      const cred = await requestSignInCredential(tx, portal, email, origin);
      if (!cred) {
        // Unknown address: no credential issued, no audit, no row — identical generic response.
        return null;
      }
      await writeAuditEvent(tx, {
        orgId: portal.orgId,
        workspaceId: portal.workspaceId,
        actorId: "requester",
        actorLabel: email,
        action: "requester.sign_in.requested",
        category: "authentication",
        reason: "Requester sign-in link requested",
        objectType: "requester_token",
        objectId: null,
        meta: { deliveryRequested: true },
      });
      return { email, url: cred.url, code: cred.code };
    });
  } catch (err) {
    // Throttling must not become an enumeration oracle: a rate-limited request returns the
    // SAME generic "check your email" redirect as an unknown address. A live-code collision
    // (the partial unique index) is astronomically rare but must also return the generic
    // response rather than a 500, so the "identical response" contract holds.
    if (err instanceof RateLimitError) {
      logError("requester-sign-in.throttled", err, { requestId: ctx.requestId, emailHash: hashEmail(email) });
    } else if ((err as { code?: string })?.code === "23505") {
      logError("requester-sign-in.code-collision", err, { requestId: ctx.requestId, emailHash: hashEmail(email) });
    } else {
      throw err;
    }
  }

  if (issued) {
    // Fire-and-forget: awaiting the SMTP round-trip here would make the known-email path
    // measurably slower and leak the address's existence by timing. Delivery stays
    // best-effort; the redirect returns immediately.
    const { sendRequesterSignInLink } = await import("@/server/auth/mailer");
    void sendRequesterSignInLink(issued.email, issued.url, issued.code).catch(() => undefined);
  }

  return NextResponse.redirect(new URL(`/track?sent=1&email=${encodeURIComponent(email)}`, origin), 303);
});
