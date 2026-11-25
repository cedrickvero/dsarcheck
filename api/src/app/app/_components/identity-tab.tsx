/**
 * E2 Identity: the verification facts and the recorded decision (derived from the audit
 * log, so the box and the history never disagree), plus the decision form.
 */
import type { IdentityRecord } from "@/server/cases/identity";
import { formatDateTime } from "@/server/cases/format";
import { IdentityDecisionForm, type IdentityDecisionAction } from "./identity-decision-form";

function decisionLabel(d: IdentityRecord["decision"]): string {
  if (!d) return "";
  if (d.decision === "approve") return "Approved";
  if (d.decision === "reject") return "Rejected";
  return "More information requested";
}

export function IdentityTab(props: {
  caseId: string;
  caseNumber: string;
  identity: IdentityRecord;
  canDecide: boolean;
  action: IdentityDecisionAction;
}) {
  const i = props.identity;

  return (
    <div className="overview-grid">
      <section className="card" aria-labelledby="id-title">
        <h2 id="id-title">Identity</h2>
        <dl className="meta-list">
          <div>
            <dt>Email</dt>
            <dd>{i.emailConfirmedAt ? `Confirmed ${formatDateTime(i.emailConfirmedAt)}` : "Pending confirmation"}</dd>
          </div>
          <div>
            <dt>Identifier</dt>
            <dd>
              {i.identifierMatch || "Unchecked"}
              {i.identifierNote ? ` · ${i.identifierNote}` : ""}
            </dd>
          </div>
          <div>
            <dt>Risk</dt>
            <dd>{i.risk}</dd>
          </div>
          <div>
            <dt>ID document</dt>
            <dd>{i.idDocumentProvided ? "Provided" : "None"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{i.identityVerified ? "Verified" : i.infoRequested ? "Awaiting information" : "Not verified"}</dd>
          </div>
        </dl>

        {i.decision ? (
          <p className="muted">
            {decisionLabel(i.decision)} · recorded by {i.decision.by} · {formatDateTime(i.decision.at)} · {i.decision.reason}
            {i.decision.infoOption ? ` (${i.decision.infoOption})` : ""}
          </p>
        ) : (
          <p className="muted">No decision recorded yet.</p>
        )}
      </section>

      <section className="card" aria-labelledby="id-decision-title">
        <h2 id="id-decision-title">Record decision</h2>
        {props.canDecide ? (
          <IdentityDecisionForm caseId={props.caseId} caseNumber={props.caseNumber} action={props.action} />
        ) : (
          <p className="muted">Your role does not permit identity decisions.</p>
        )}
      </section>
    </div>
  );
}
