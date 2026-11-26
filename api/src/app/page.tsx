/**
 * The root page is host-aware: on a portal host it renders the public intake form
 * (docs/03 § H); everywhere else it is the staff sign-in landing (docs/03 § G4). The portal
 * is resolved from the Host header only — never the path or query.
 */
import { headers } from "next/headers";
import { BRAND } from "@/domain/platform";
import { SignInForm } from "./_components/sign-in-form";
import { IntakeForm } from "./_components/intake-form";
import { resolvePortalByHost } from "@/server/portal/resolve";

export default async function HomePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.searchParams;
  const sent = params.sent === "1";
  const error = params.error === "1";
  const hostHeader = (await headers()).get("host");
  const portal = await resolvePortalByHost(hostHeader);

  if (portal) {
    return (
      <main className="intake-page">
        <div className="intake-card">
          <h1>Make a data protection request</h1>
          <p className="intake-sub">
            Use this form to exercise your rights under the GDPR. We will reply within one month and email you a reference number straight away.
          </p>
          {error ? (
            <div className="intake-banner" role="alert">
              Some fields need attention before you can submit.
            </div>
          ) : null}
          <IntakeForm companyName={portal.name} />
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title">{BRAND}</h1>
        <p className="auth-sub">DSAR fulfillment and evidence workspace.</p>
        <SignInForm initiallySent={sent} />
      </section>
    </main>
  );
}
