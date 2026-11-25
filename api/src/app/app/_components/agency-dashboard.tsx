/**
 * The agency dashboard (docs/03 § B): eight org-wide KPI tiles and the "Client workspaces"
 * table. Read-only aggregation across the org's client workspaces; the "Open cases"
 * workspace switch is a follow-on slice.
 */
import { formatDate, formatDateTime } from "@/server/cases/format";
import type { AgencyDashboard } from "@/server/cases/agency";

const KPIS = [
  { label: "Open cases", key: "totalOpen" as const },
  { label: "Due within 7 days", key: "dueSoon" as const, color: "#B54708" },
  { label: "Overdue", key: "overdue" as const, color: "#B42318" },
  { label: "Awaiting approval", key: "awaitingApproval" as const },
  { label: "High-risk verifications", key: "highRisk" as const },
  { label: "Systems in Action required", key: "actionRequired" as const },
  { label: "Completed this month", key: "completedThisMonth" as const, color: "#0E6B4D" },
];

export function AgencyDashboard(props: { data: AgencyDashboard; at: Date }) {
  const { data } = props;

  return (
    <section className="dashboard">
      <header className="page-header">
        <div>
          <h1>Agency dashboard</h1>
          <p className="subtitle">
            {data.orgName} · all client workspaces · {formatDate(props.at)}
          </p>
        </div>
      </header>

      <div className="kpi-grid">
        {KPIS.map((kpi) => (
          <article className="kpi" key={kpi.label}>
            <span className="kpi-label">{kpi.label}</span>
            <span className="kpi-value" style={{ color: kpi.color }}>
              {data[kpi.key]}
            </span>
          </article>
        ))}
        <article className="kpi">
          <span className="kpi-label">Average time to closure</span>
          <span className="kpi-value">
            {data.avgClosureDays === null ? "—" : `${data.avgClosureDays.toFixed(1)} days`}
          </span>
        </article>
      </div>

      <section className="attention-card" aria-labelledby="clients-title">
        <h2 id="clients-title">Client workspaces</h2>
        <p className="caption">Sorted by nearest deadline per client</p>

        {data.clients.length === 0 ? (
          <p className="muted">No client workspaces yet.</p>
        ) : (
          <table className="case-table">
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col">Open</th>
                <th scope="col">Due ≤ 7 days</th>
                <th scope="col">Overdue</th>
                <th scope="col">Awaiting approval</th>
                <th scope="col">Action required</th>
                <th scope="col">Avg. closure</th>
                <th scope="col">Next deadline</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((c) => (
                <tr key={c.workspaceId}>
                  <th scope="row">
                    <span className="system-name">{c.name}</span>
                  </th>
                  <td>{c.open}</td>
                  <td>{c.dueSoon}</td>
                  <td>
                    <span className={c.overdue > 0 ? "sla-label" : undefined} data-risk={c.overdue > 0 ? "overdue" : undefined}>
                      {c.overdue}
                    </span>
                  </td>
                  <td>{c.awaitingApproval}</td>
                  <td>
                    <span className={c.actionRequired > 0 ? "sla-label" : undefined} data-risk={c.actionRequired > 0 ? "warn" : undefined}>
                      {c.actionRequired}
                    </span>
                  </td>
                  <td>{c.avgClosureDays === null ? "—" : `${c.avgClosureDays.toFixed(1)} days`}</td>
                  <td>
                    {c.nextDeadline ? (
                      <>
                        <span className="mono">{c.nextDeadline.caseNumber}</span>
                        <span className="system-sub">{formatDateTime(c.nextDeadline.dueAt)}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
