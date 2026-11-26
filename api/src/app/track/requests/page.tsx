/**
 * "Your requests" (docs/03 § H2). The requester session cookie is resolved to a
 * workspace+email session, and only that email's cases in the session's workspace are shown
 * — never internal notes, staff names, risk or audit (those fields are not selected).
 */
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { withLookup, withTenant } from "@/db/client";
import { hashToken } from "@/server/auth/crypto";
import { resolvePortalByHost } from "@/server/portal/resolve";
import { listRequesterRequests, requesterCookieName, resolveRequesterSession } from "@/server/portal/requester";
import { formatDate } from "@/server/cases/format";

export const dynamic = "force-dynamic";

const REQUEST_TITLES: Record<string, string> = {
  Access: "Copy of your personal data",
  Rectification: "Correct your personal data",
  Erasure: "Delete your personal data",
  Portability: "Your data in a portable format",
  Objection: "Stop using your data",
};

export default async function RequestsPage() {
  const hostHeader = (await headers()).get("host");
  const portal = await resolvePortalByHost(hostHeader);
  if (!portal) notFound();

  const token = (await cookies()).get(requesterCookieName())?.value;
  if (!token) redirect("/track");

  const session = await withLookup({ requesterSessionTokenHash: hashToken(token) }, (tx) =>
    resolveRequesterSession(tx, token),
  );
  if (!session || session.workspaceId !== portal.workspaceId) redirect("/track");

  const cards = await withTenant(
    { orgId: session.orgId, workspaceId: session.workspaceId, actorId: "requester" },
    (tx) => listRequesterRequests(tx, session.email),
  );

  return (
    <main className="intake-page">
      <div className="intake-card intake-card--wide">
        <h1>Your requests</h1>
        <p className="intake-sub">Requests made with {session.email}</p>
        <div className="intake-actions">
          <a className="button" href="/">Make a new request</a>
          <a className="button button--ghost" href="/api/track/sign-out">Sign out</a>
        </div>

        {cards.length === 0 ? (
          <p className="intake-note">No requests yet.</p>
        ) : (
          <ul className="requester-list">
            {cards.map((c) => (
              <li key={c.caseNumber} className="requester-card">
                <span className="intake-ref">{c.caseNumber}</span>
                <span className="requester-title">{REQUEST_TITLES[c.requestType] ?? c.requestType}</span>
                <span className="requester-status">{c.status}</span>
                <span className="requester-dates">
                  Received {formatDate(c.createdAt)}
                  {c.closedAt ? ` · Completed ${formatDate(c.closedAt)}` : ` · Response due by ${formatDate(c.statutoryDueAt ?? new Date())}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
