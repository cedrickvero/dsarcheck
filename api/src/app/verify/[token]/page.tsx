/**
 * Email-confirmation landing (G2). Redeems the single-use confirmation link, marks the case
 * emailVerification Confirmed and logs "Email address confirmed". An unknown, expired,
 * malformed or replayed token renders a generic "link expired" state — no enumeration.
 */
import { confirmRequesterEmail } from "@/server/portal/requester";

export const dynamic = "force-dynamic";

export default async function VerifyPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const result = await confirmRequesterEmail(token);

  return (
    <main className="intake-page">
      <div className="intake-card">
        {result ? (
          <>
            <span className="intake-done-icon" aria-hidden="true">✓</span>
            <h1>Email confirmed</h1>
            <p>Your email address is confirmed for request {result.caseNumber}.</p>
            <div className="intake-actions">
              <a className="button button--primary" href="/track">Track your request</a>
            </div>
          </>
        ) : (
          <>
            <h1>Link expired</h1>
            <p>This confirmation link is no longer valid. It may have expired or already been used.</p>
            <div className="intake-actions">
              <a className="button" href="/track">Track your request</a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
