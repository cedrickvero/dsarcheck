/**
 * GET /mfa - complete the TOTP step for the current session.
 *
 * Reachable ONLY by a session whose MFA is outstanding (an owner/approver/workspace_admin
 * who just redeemed a link). A session that does not need MFA, or has already satisfied it,
 * is redirected straight to /app. The partial gate is used here deliberately and only here -
 * the page touches nothing but the caller's own mfa_totp row.
 */
import { redirect } from "next/navigation";
import { withTenant } from "@/db/client";
import { isEnrolled } from "@/server/auth/totp";
import { requireAuthForMfaStepAmbient, mfaStepDestination } from "@/server/auth/require-auth";
import { BRAND } from "@/domain/platform";
import { MfaForm } from "./_components/mfa-form";

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const actor = await requireAuthForMfaStepAmbient().catch(() => null);
  const destination = mfaStepDestination(actor);
  if (destination) redirect(destination);

  // destination is null only for a non-null, MFA-owing session.
  const enrolled = await withTenant(
    { orgId: actor!.orgId, workspaceId: actor!.workspaceId, actorId: actor!.userId },
    (tx) => isEnrolled(tx, actor!.userId),
  );

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="mfa-title">
        <h1 id="mfa-title">{BRAND}</h1>
        <p className="auth-sub">Two-factor verification.</p>
        <MfaForm enrolled={enrolled} email={actor!.label} />
      </section>
    </main>
  );
}
