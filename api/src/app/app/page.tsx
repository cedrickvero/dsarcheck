/**
 * The direct dashboard (docs/03 § B).
 *
 * Server Component: authenticates, reads the tenant-scoped rows, and derives every number
 * in the pure domain module. The client receives only finished strings, so no timezone or
 * SLA arithmetic happens in the browser. The agency "Client workspaces" table is a
 * separate slice (it needs the multi-workspace membership model, which is not built yet).
 */
import { requireAuth } from "@/server/auth/require-auth";
import { now } from "@/server/time";
import { dashboardRows } from "@/server/cases/dashboard";
import { workspaceNameFor } from "@/server/cases/query";
import { sla } from "@/domain/sla";
import {
  attentionItems,
  caseStats,
  DASHBOARD_COPY,
  widgetValues,
} from "@/domain/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await requireAuth();
  const at = now();

  const [{ rows }, client] = await Promise.all([
    dashboardRows(actor),
    workspaceNameFor(actor),
  ]);

  const stats = caseStats(rows, at);
  const values = widgetValues(stats);
  const attention = attentionItems(rows, at);
  const byNumber = new Map(rows.map((row) => [row.caseNumber, row]));

  return (
    <section className="dashboard">
      <header className="page-header">
        <div>
          <h1>{DASHBOARD_COPY.title}</h1>
          <p className="subtitle">{DASHBOARD_COPY.subtitle(client, at)}</p>
        </div>
      </header>

      <div className="kpi-grid">
        {DASHBOARD_COPY.widgets.map((widget, index) => (
          <article className="kpi" key={widget.label}>
            <span className="kpi-label">{widget.label}</span>
            <span className="kpi-value" style={{ color: widget.color }}>
              {values[index]}
            </span>
          </article>
        ))}
      </div>

      <section className="attention-card" aria-labelledby="attention-title">
        <h2 id="attention-title">{DASHBOARD_COPY.attention.title}</h2>
        <p className="caption">{DASHBOARD_COPY.attention.caption}</p>

        {attention.length === 0 ? (
          <div className="state-panel" data-state="empty" role="status">
            <p className="state-marker" aria-hidden="true">{"\u25CB"}</p>
            <h3>{DASHBOARD_COPY.attention.emptyTitle}</h3>
            <p>{DASHBOARD_COPY.attention.emptyBody}</p>
          </div>
        ) : (
          <table className="case-table">
            <caption className="visually-hidden">Cases ordered by what blocks closure first</caption>
            <thead>
              <tr>
                <th scope="col">{DASHBOARD_COPY.attention.columns.case}</th>
                <th scope="col">{DASHBOARD_COPY.attention.columns.action}</th>
                <th scope="col">{DASHBOARD_COPY.attention.columns.status}</th>
                <th scope="col">{DASHBOARD_COPY.attention.columns.owner}</th>
                <th scope="col">{DASHBOARD_COPY.attention.columns.sla}</th>
                <th scope="col"><span className="visually-hidden">Open case</span></th>
              </tr>
            </thead>
            <tbody>
              {attention.map((item) => {
                const row = byNumber.get(item.caseNumber)!;
                const state = sla({
                  status: row.status,
                  receivedAt: row.receivedAt,
                  extensionMonths: row.extensionMonths,
                  closedAt: row.closedAt,
                  now: at,
                });
                return (
                  <tr key={item.caseNumber}>
                    <th scope="row">
                      <a href={`/app/cases/${item.caseNumber}`} className="mono">{item.caseNumber}</a>
                      <span className="requester">{item.requestType} · {item.requesterName}</span>
                    </th>
                    <td>{item.why}</td>
                    <td><span className="status" data-status={item.status}>{item.status}</span></td>
                    <td>{item.ownerName ?? DASHBOARD_COPY.unassigned}</td>
                    <td><span className="sla-label" data-risk={state.risk}>{state.label}</span></td>
                    <td>
                      <a className="button button-outline" href={`/app/cases/${item.caseNumber}`}>
                        {DASHBOARD_COPY.attention.open}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
