import type { CaseSummary } from "@/server/cases/format";

/** The cockpit header: one case's identity and SLA, text first. */
export function CaseHeader(props: { summary: CaseSummary }) {
  const s = props.summary;
  return (
    <header className="case-header">
      <h1>{s.caseNumber}</h1>
      <dl>
        <div><dt>Type</dt><dd>{s.requestType}</dd></div>
        <div><dt>Status</dt><dd><span className="status" data-status={s.status}>{s.statusLabel}</span></dd></div>
        <div><dt>Priority</dt><dd>{s.priority}</dd></div>
        <div><dt>Received</dt><dd>{s.received}</dd></div>
        <div>
          <dt>Statutory deadline</dt>
          <dd>{s.due} <span className="deadline" data-deadline={s.deadline.state}>{s.deadline.label}</span></dd>
        </div>
      </dl>
    </header>
  );
}
