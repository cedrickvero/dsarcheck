/**
 * E3 Data-source checklist: the per-system grid and the per-row status form. The status
 * change is a server action (passed in as a prop so this component stays server-only and
 * the boundary holds); the exception categories are passed in for the same reason.
 */
import type { ChecklistSystemRow } from "@/server/cases/checklist";
import { EXCEPTION_CATEGORIES } from "@/server/cases/checklist";
import { formatDate } from "@/server/cases/format";
import { SystemStatusForm } from "./system-status-form";

const DONE = ["Completed", "Not found", "Retained under exception"];

export type SystemStatusAction = (input: {
  caseId: string;
  caseNumber: string;
  sourceKey: string;
  status: string;
  reason: string;
  exceptionCategory?: string;
}) => Promise<{ ok: boolean; message?: string }>;

export function ChecklistTab(props: {
  caseId: string;
  caseNumber: string;
  deadline: Date;
  systems: ChecklistSystemRow[];
  action: SystemStatusAction;
}) {
  const done = props.systems.filter((s) => DONE.includes(s.status)).length;
  const total = props.systems.length;

  return (
    <section className="card" aria-labelledby="checklist-title">
      <h2 id="checklist-title">Data-source checklist</h2>
      <p className="progress-line">
        {done} of {total} systems complete · tasks due before {formatDate(props.deadline)}
      </p>

      {total === 0 ? (
        <p className="muted">No data sources recorded for this case.</p>
      ) : (
        <table className="checklist-table">
          <thead>
            <tr>
              <th scope="col">Data source</th>
              <th scope="col">Owner</th>
              <th scope="col">Due</th>
              <th scope="col">Status</th>
              <th scope="col">Evidence</th>
              <th scope="col">Update</th>
            </tr>
          </thead>
          <tbody>
            {props.systems.map((s) => (
              <tr key={s.sourceKey}>
                <td>
                  <span className="system-name">{s.name || s.sourceKey}</span>
                  {s.searchMethod ? <span className="system-sub">{s.searchMethod}</span> : null}
                </td>
                <td>{s.ownerName || "Unassigned"}</td>
                <td>{s.dueAt ? formatDate(s.dueAt) : "—"}</td>
                <td>
                  <span className="status" data-status={s.status}>
                    {s.status}
                  </span>
                  {s.reason ? (
                    <span className="system-sub">
                      {" "}
                      · {s.reason}
                      {s.exceptionCategory ? ` (${s.exceptionCategory})` : ""}
                    </span>
                  ) : null}
                </td>
                <td>{s.evidenceCount > 0 ? `${s.evidenceCount} file${s.evidenceCount === 1 ? "" : "s"}` : "None"}</td>
                <td>
                  <SystemStatusForm
                    caseId={props.caseId}
                    caseNumber={props.caseNumber}
                    sourceKey={s.sourceKey}
                    currentStatus={s.status}
                    exceptionCategories={[...EXCEPTION_CATEGORIES]}
                    action={props.action}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
