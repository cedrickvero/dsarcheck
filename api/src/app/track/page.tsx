/**
 * Requester portal sign-in (docs/03 § H2). Host-aware like the intake: an unknown host is
 * 404. `?sent=1` shows the "Check your email" (code entry) state; the generic response
 * never reveals whether the address has a request.
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolvePortalByHost } from "@/server/portal/resolve";

export const dynamic = "force-dynamic";

export default async function TrackPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.searchParams;
  const sent = params.sent === "1";
  const codeError = params.code === "1";
  const email = typeof params.email === "string" ? params.email : "";

  const hostHeader = (await headers()).get("host");
  const portal = await resolvePortalByHost(hostHeader);
  if (!portal) notFound();

  return (
    <main className="intake-page">
      <div className="intake-card">
        {sent ? (
          <>
            <span className="intake-done-icon" aria-hidden="true">✉</span>
            <h1>Check your email</h1>
            <p>
              We sent a sign-in link to <strong>{email}</strong>. Open it on this device, or enter the 6-digit code from the same email.
            </p>
            <form method="post" action="/api/track/verify" className="intake-form">
              <label className="intake-label">
                <span>Sign-in code</span>
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  required
                />
              </label>
              {codeError ? (
                <span className="intake-error" role="alert">Enter the 6-digit code from the email.</span>
              ) : null}
              <button type="submit" className="button button--primary">Sign in</button>
              <div className="intake-links">
                <a href="/track">Use a different email</a>
              </div>
            </form>
            <p className="intake-note">The link and code expire after 15 minutes and work once.</p>
          </>
        ) : (
          <>
            <h1>Track your privacy request</h1>
            <p className="intake-sub">
              Enter the email address you used to make your request. We'll send you a sign-in link and a code. No password needed.
            </p>
            <form method="post" action="/api/track/request" className="intake-form">
              <label className="intake-label">
                <span>Email address</span>
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <button type="submit" className="button button--primary">Email me a sign-in link</button>
            </form>
            <p className="intake-note">
              For your security, we never show whether an email address has a request. If it does, the email arrives within a minute.
            </p>
            <p className="intake-note">
              Haven't made a request yet? <a href="/">Make a data protection request</a>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
