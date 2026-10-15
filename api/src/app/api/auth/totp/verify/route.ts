/**
 * POST /api/auth/totp/verify - complete the MFA step for the current session.
 *
 * Generic failure: a wrong code, a replayed code and a code for a user with no
 * enrolment all return the identical 401. Rate-limited by user id.
 */
import { NextResponse } from "next/server";
import { withTenant } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";
import { route } from "@/server/http/handler";
import { UnauthenticatedError, ValidationError } from "@/server/http/errors";
import { env } from "@/env";
import { requireAuthForMfaStep } from "@/server/auth/require-auth";
import { confirmEnrolment, isEnrolled, verifyForUser } from "@/server/auth/totp";
import { markMfaSatisfied } from "@/server/auth/session-store";
import { enforceRateLimit, bucketKey } from "@/server/auth/rate-limit";

export const POST = route(async (req) => {
  const actor = await requireAuthForMfaStep(req);
  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  if (typeof body.code !== "string" || body.code.trim() === "") {
    throw new ValidationError("a verification code is required");
  }

  const ok = await withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      await enforceRateLimit(tx, {
        bucketKey: bucketKey([actor.userId]),
        scope: "totp_verify",
        limit: env.RATE_LIMIT_TOTP_PER_HOUR,
        windowSeconds: 3600,
        workspaceId: actor.workspaceId,
      });

      const already = await isEnrolled(tx, actor.userId);
      const verified = already
        ? await verifyForUser(tx, actor.userId, body.code as string)
        : await confirmEnrolment(tx, actor.userId, body.code as string);
      if (!verified) return false;

      if (actor.sessionId) await markMfaSatisfied(tx, actor.sessionId);
      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: already ? "auth.mfa.verified" : "auth.mfa.enrolled",
        category: "authentication",
        reason: already ? "TOTP verified at sign-in" : "TOTP enrolment confirmed",
        objectType: "mfa_totp",
        objectId: null,
        meta: { method: "totp" },
      });
      return true;
    },
  );

  if (!ok) throw new UnauthenticatedError();
  return NextResponse.json({ ok: true });
});
