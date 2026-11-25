import type { CaseOverview } from "@/server/cases/overview";
import { formatDate } from "@/server/cases/format";

/** E1 Overview: the request as the requester made it, plus the systems progress. */
export function OverviewTab({ overview }: { overview: CaseOverview }) {
  const c = overview.case;
  const { systemsDone: done, systemsTotal: total } = overview;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="overview-grid">
      <section className="card" aria-labelledby="ov-request">
        <h2 id="ov-request">Request</h2>
        <dl className="meta-list">
          <div>
            <dt>Requester</dt>
            <dd>
              {c.requesterName || "—"}
              {c.requesterEmail ? <span className="email"> · {c.requesterEmail}</span> : null}
            </dd>
          </div>
          <div>
            <dt>Identifier</dt>
            <dd>{c.identifier || "—"}</dd>
          </div>
          <div>
            <dt>Channel</dt>
            <dd>Hosted intake form</dd>
          </div>
          <div>
            <dt>Received</dt>
            <dd>{formatDate(c.receivedAt)}</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{c.priority}</dd>
          </div>
          <div>
            <dt>Risk</dt>
            <dd>{c.risk}</dd>
          </div>
        </dl>
        {c.details ? (
          <blockquote className="request-quote">{c.details}</blockquote>
        ) : (
          <p className="muted">No request text was provided.</p>
        )}
      </section>

      <section className="card" aria-labelledby="ov-systems">
        <h2 id="ov-systems">Systems</h2>
        <p className="progress-line">
          {done} of {total} systems complete
        </p>
        <div
          className="progress"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${done} of ${total} systems complete`}
        >
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        {total > 0 ? (
          <ul className="system-list">
            {overview.systems.map((s) => (
              <li key={s.name}>
                <span className="system-name">{s.name || "Unnamed system"}</span>
                <span className="system-status" data-status={s.status}>
                  {s.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No data sources recorded for this case.</p>
        )}
        <p>
          <a href="?tab=checklist">Open checklist</a>
        </p>
      </section>
    </div>
  );
}
