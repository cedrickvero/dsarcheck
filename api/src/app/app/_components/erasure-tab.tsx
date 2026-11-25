/**
 * E4b Erasure outcomes: the per-system outcome board. Each system records one outcome;
 * the outcome, recorded time and reason are shown as text.
 */
import type { ErasureView } from "@/server/cases/erasure";
import { EXCEPTION_CATEGORIES } from "@/server/cases/checklist";
import { formatDateTime } from "@/server/cases/format";
import { ErasureOutcomeForm, type ErasureOutcomeAction } from "./erasure-outcome-form";

export function ErasureTab(props: {
  caseId: string;
  caseNumber: string;
  view: ErasureView;
  action: ErasureOutcomeAction;
}) {
  const v = props.view;

  return (
    <section className="card" aria-labelledby="erasure-title">
      <h2 id="erasure-title">Erasure outcomes</h2>
      <p className="muted">
        Deletion, suppression and retention are recorded separately. Record an outcome for each system.
      </p>

      {v.systems.length === 0 ? (
        <p className="muted">No data sources recorded for this case.</p>
      ) : (
        <table className="checklist-table">
          <thead>
            <tr>
              <th scope="col">System</th>
              <th scope="col">Outcome</th>
              <th scope="col">Recorded</th>
              <th scope="col">Reason</th>
              <th scope="col">Update</th>
            </tr>
          </thead>
          <tbody>
            {v.systems.map((s) => (
              <tr key={s.sourceKey}>
                <td>
                  <span className="system-name">{s.name || s.sourceKey}</span>
                  {s.ownerName ? <span className="system-sub">{s.ownerName}</span> : null}
                </td>
                <td>
                  <span className="status" data-status={s.outcome ?? ""}>
                    {s.outcome ?? "Not recorded"}
                  </span>
                </td>
                <td>{s.outcomeAt ? formatDateTime(s.outcomeAt) : "—"}</td>
                <td>
                  {s.reason || "—"}
                  {s.exceptionCategory ? ` (${s.exceptionCategory})` : ""}
                </td>
                <td>
                  <ErasureOutcomeForm
                    caseId={props.caseId}
                    caseNumber={props.caseNumber}
                    sourceKey={s.sourceKey}
                    currentOutcome={s.outcome}
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
