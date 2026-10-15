/**
 * POST /api/auth/totp/enrol - begin TOTP enrolment.
 *
 * The secret is stored encrypted and unconfirmed. It is returned ONCE, as an otpauth
 * URI, because enrolment is impossible otherwise - the user has to get the secret into
 * their authenticator somehow. It is never returned by any other endpoint, never
 * logged, and never written to an audit payload.
 *
 * FLAGGED FOR REVIEW: the owner's brief says the secret is "never returned in API
 * responses". TOTP enrolment cannot satisfy that literally. The interpretation taken
 * here is "never returned after enrolment, and never in any form that can be read back",
 * and it is raised for the guardrail to confirm or overrule.
 */
import { NextResponse } from "next/server";
import { withTenant } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";
import { route } from "@/server/http/handler";
import { requireAuthForMfaStep } from "@/server/auth/require-auth";
import { beginEnrolment } from "@/server/auth/totp";

export const POST = route(async (req) => {
  const actor = await requireAuthForMfaStep(req);
  const workspaceId = actor.workspaceId;

  const secret = await withTenant(
    { orgId: actor.orgId, workspaceId, actorId: actor.userId },
    async (tx) => {
      const s = await beginEnrolment(tx, {
        userId: actor.userId,
        orgId: actor.orgId,
        workspaceId,
      });
      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: "auth.mfa.enrolment_started",
        category: "authentication",
        reason: "TOTP enrolment started",
        objectType: "mfa_totp",
        objectId: null,
        meta: { method: "totp" },
      });
      return s;
    },
  );

  const label = encodeURIComponent(actor.label);
  const issuer = encodeURIComponent("Privacyspace");
  return NextResponse.json({
    otpauthUri: `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&period=30&digits=6`,
    next: "POST /api/auth/totp/verify with a code to confirm.",
  });
});
