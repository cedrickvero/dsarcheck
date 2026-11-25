/**
 * E5 Approval & response: the pre-closure checklist, the response preview (from respText),
 * the approval actions, and the approval history (from the audit log).
 */
import type { ApprovalView } from "@/server/cases/approval";
import { RESPONSE_TEMPLATES } from "@/domain/respText";
import { formatDateTime } from "@/server/cases/format";
import { ApprovalForm, type ApprovalActions } from "./approval-form";

export function ApprovalTab(props: {
  caseId: string;
  caseNumber: string;
  view: ApprovalView;
  actions: ApprovalActions;
}) {
  const v = props.view;

  return (
    <div className="overview-grid">
      <section className="card" aria-labelledby="ap-checks">
        <h2 id="ap-checks">Before closure</h2>
        <ul className="check-list">
          {v.checks.items.map((c) => (
            <li key={c.id}>
              <span className={c.satisfied ? "check-ok" : "check-open"} aria-hidden="true">
                {c.satisfied ? "✓" : "○"}
              </span>
              <span className="check-label">{c.label}</span>
              <span className="check-detail">{c.detail}</span>
              <a href={`?tab=${c.tab}`}>View</a>
            </li>
          ))}
        </ul>
        {!v.checks.allPass ? (
          <p className="muted">Closure is blocked until every checklist item is done.</p>
        ) : null}
      </section>

      <section className="card" aria-labelledby="ap-response">
        <h2 id="ap-response">Response preview</h2>
        <pre className="response-preview">{v.responsePreview}</pre>
      </section>

      <section className="card" aria-labelledby="ap-approval">
        <h2 id="ap-approval">Approval</h2>
        <p>
          Status: <span className="status" data-status={v.status}>{v.status}</span>
        </p>
        <ApprovalForm
          caseId={props.caseId}
          caseNumber={props.caseNumber}
          status={v.status}
          template={v.template}
          templates={[...RESPONSE_TEMPLATES]}
          canSend={v.canSendForApproval}
          canDecide={v.canDecideClosure}
          actions={props.actions}
        />

        <h3>History</h3>
        {v.history.length === 0 ? (
          <p className="muted">No approval history yet.</p>
        ) : (
          <ul className="history-list">
            {v.history.map((h, i) => (
              <li key={i}>
                <span className="history-action">{h.action}</span> by {h.by} · {formatDateTime(h.at)} · {h.reason}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
