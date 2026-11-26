/**
 * Requester request detail (docs/03 § H2). Session- and email-scoped like the list: the case
 * must belong to the session's email AND workspace. Only requester-safe fields are surfaced
 * (never internal notes, staff names, system names, risk or audit data).
 */
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { withLookup, withTenant } from "@/db/client";
import { hashToken } from "@/server/auth/crypto";
import { resolvePortalByHost } from "@/server/portal/resolve";
import {
  getRequesterCaseDetail,
  requesterCookieName,
  requesterStatusView,
  requesterSummary,
  requesterTitle,
  resolveRequesterSession,
} from "@/server/portal/requester";
import { formatDate } from "@/server/cases/format";

export const dynamic = "force-dynamic";

function progressPct(status: string, infoRequested: boolean): number {
  const s = status.toLowerCase();
  if (s === "completed" || s === "rejected") return 100;
  if (s === "awaiting approval") return 80;
  if (s === "extended") return 32;
  if (s === "in progress") return 63;
  return infoRequested ? 40 : 30;
}

function buildSteps(status: string): { label: string; done: boolean; current: boolean }[] {
  const s = status.toLowerCase();
  const done = (set: string[]) => set.includes(s);
  return [
    { label: "Received", done: true, current: false },
    { label: "Identity confirmed", done: done(["in progress", "extended", "awaiting approval", "completed"]), current: s === "new" || s === "verifying" },
    { label: "Collecting your data", done: done(["awaiting approval", "completed"]), current: s === "in progress" || s === "extended" },
    { label: "Final review", done: s === "completed", current: s === "awaiting approval" },
    { label: "Completed", done: s === "completed", current: false },
  ];
}

export default async function RequestDetailPage(props: { params: Promise<{ caseNumber: string }> }) {
  const { caseNumber } = await props.params;

  const hostHeader = (await headers()).get("host");
  const portal = await resolvePortalByHost(hostHeader);
  if (!portal) notFound();

  const token = (await cookies()).get(requesterCookieName())?.value;
  if (!token) redirect("/track");

  const session = await withLookup({ requesterSessionTokenHash: hashToken(token) }, (tx) =>
    resolveRequesterSession(tx, token),
  );
  if (!session || session.workspaceId !== portal.workspaceId) redirect("/track");

  const number = decodeURIComponent(caseNumber);
  const detail = await withTenant(
    { orgId: session.orgId, workspaceId: session.workspaceId, actorId: "requester" },
    (tx) => getRequesterCaseDetail(tx, number, session.email),
  );
  if (!detail) notFound();

  const st = requesterStatusView(detail.status, detail.infoRequested);
  const summary = requesterSummary(detail.status, detail.infoRequested);
  const title = requesterTitle(detail.requestType);
  const isExtended = detail.status.toLowerCase() === "extended" || detail.extensionMonths > 0;
  const completed = detail.status.toLowerCase() === "completed";
  const daysLeft = detail.statutoryDueAt
    ? Math.max(0, Math.ceil((detail.statutoryDueAt.getTime() - Date.now()) / 86_400_000))
    : null;
  const steps = buildSteps(detail.status);

  return (
    <main className="intake-page intake-page--wide">
      <div className="requester-crumb">
        <a href="/track/requests">Your requests</a>
        <span>/</span>
        <span className="intake-ref">{detail.caseNumber}</span>
      </div>

      <div className="requester-detail">
        <div className="requester-detail-main">
          <section className="requester-panel">
            <div className="requester-status-head">
              <h1>{title}</h1>
              <span className="requester-status" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
            </div>
            <p className="requester-summary">{summary}</p>
            <div className="requester-due">
              <span className="requester-due-label">{completed ? "Completed" : "Response due by"}</span>
              <span className="requester-due-date">{formatDate(completed && detail.closedAt ? detail.closedAt : (detail.statutoryDueAt ?? new Date()))}</span>
              <span className="requester-due-note">
                {completed ? "Thank you for your request" : daysLeft === 0 ? "Due today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
              </span>
              <span className="requester-progress" aria-hidden="true">
                <span style={{ width: `${progressPct(detail.status, detail.infoRequested)}%` }} />
              </span>
            </div>
          </section>

          {isExtended && !completed ? (
            <div className="requester-notice requester-notice--blue" role="status">
              <strong>We need more time.</strong>{" "}
              Your request involves a large volume of information, so we've extended the deadline. The law allows this for complex requests. You'll still get everything you asked for.
            </div>
          ) : null}

          <section className="requester-panel">
            <h2>Progress</h2>
            <ol className="requester-timeline">
              {steps.map((step) => (
                <li key={step.label} className="requester-step">
                  <span className={`requester-step-dot ${step.done ? "is-done" : step.current ? "is-current" : ""}`} aria-hidden="true">
                    {step.done ? "✓" : ""}
                  </span>
                  <span className={step.current || step.done ? "requester-step-label is-active" : "requester-step-label"}>{step.label}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="requester-aside">
          <section className="requester-panel">
            <h2>Request details</h2>
            <dl className="requester-facts">
              <div><dt>Reference</dt><dd className="intake-ref">{detail.caseNumber}</dd></div>
              <div><dt>Type</dt><dd>{requesterTitle(detail.requestType)}</dd></div>
              <div><dt>Received</dt><dd>{formatDate(detail.receivedAt)}</dd></div>
              <div><dt>{completed ? "Completed" : "Response due by"}</dt><dd>{formatDate(completed && detail.closedAt ? detail.closedAt : (detail.statutoryDueAt ?? new Date()))}</dd></div>
            </dl>
          </section>
          <section className="requester-panel">
            <h2>What you asked for</h2>
            <blockquote className="requester-quote">{detail.details}</blockquote>
            <p className="intake-note">Quote {detail.caseNumber} if you contact us about this request.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
