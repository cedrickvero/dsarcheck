/**
 * The intake confirmation ("We received your request", docs/03 § H). Read-only: re-resolves
 * the portal from the Host and reads the case by number under that workspace's tenant, so a
 * reference from another workspace (or an unknown host) renders not-found — no enumeration.
 */
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cases } from "@/db/schema";
import { withTenant } from "@/db/client";
import { resolvePortalByHost } from "@/server/portal/resolve";
import { formatDate } from "@/server/cases/format";

export const dynamic = "force-dynamic";

export default async function ReceivedPage(props: {
  params: Promise<{ caseNumber: string }>;
  searchParams: Promise<{ dup?: string }>;
}) {
  const { caseNumber } = await props.params;
  const { dup } = await props.searchParams;
  const hostHeader = (await headers()).get("host");
  const portal = await resolvePortalByHost(hostHeader);
  if (!portal) notFound();

  const number = decodeURIComponent(caseNumber);
  const rows = await withTenant({ orgId: portal.orgId, workspaceId: portal.workspaceId, actorId: "system" }, (tx) =>
    tx
      .select({ receivedAt: cases.receivedAt, statutoryDueAt: cases.statutoryDueAt })
      .from(cases)
      .where(and(eq(cases.caseNumber, number), eq(cases.workspaceId, portal.workspaceId)))
      .limit(1),
  );
  const row = rows[0];
  if (!row) notFound();

  return (
    <main className="intake-page">
      <div className="intake-card intake-card--done">
        <span className="intake-done-icon" aria-hidden="true">
          ✓
        </span>
        <h1>We received your request</h1>
        {dup ? (
          <p className="intake-dup" role="note">
            You already have an open request about this email (reference{" "}
            <span className="intake-ref">{decodeURIComponent(dup)}</span>). Your new request has been recorded
            separately.
          </p>
        ) : null}
        <div className="intake-meta">
          <div>
            <div className="intake-meta-label">Reference</div>
            <div className="intake-ref">{number}</div>
          </div>
          <div>
            <div className="intake-meta-label">Received</div>
            <div>{formatDate(row.receivedAt)}</div>
          </div>
          <div>
            <div className="intake-meta-label">Response due by</div>
            <div>{formatDate(row.statutoryDueAt)}</div>
          </div>
        </div>
        <ol className="intake-steps">
          <li>Check your inbox and click the confirmation link to verify your email.</li>
          <li>We may ask for one more piece of information to confirm it is you.</li>
          <li>You can track progress at any time from the link in the email.</li>
        </ol>
        <div className="intake-actions">
          <a className="button button--primary" href="/track">
            Track your request
          </a>
          <a className="button" href="/">
            Submit another request
          </a>
        </div>
      </div>
    </main>
  );
}
