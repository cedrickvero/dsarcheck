import type { CaseAuditRow } from "@/server/cases/audit";
import { formatDateTime } from "@/server/cases/format";

/** E7 Audit log: append-only, newest first. Time is a real date string, never colour-only. */
export function AuditTab({ events }: { events: CaseAuditRow[] }) {
  return (
    <section className="card" aria-labelledby="audit-title">
      <h2 id="audit-title">Audit log</h2>
      <p className="muted">Append-only. Entries cannot be edited or deleted.</p>
      {events.length === 0 ? (
        <p>No recorded actions yet.</p>
      ) : (
        <table className="audit-table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Reason</th>
              <th scope="col">Category</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={`${e.at.getTime()}-${e.action}-${e.actorLabel}`}>
                <td>{formatDateTime(e.at)}</td>
                <td>{e.actorLabel}</td>
                <td>{e.action}</td>
                <td>{e.reason || "—"}</td>
                <td>
                  <span className="audit-category">{e.category}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
