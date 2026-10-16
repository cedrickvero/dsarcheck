import type { CaseSummary } from "@/server/cases/format";

/**
 * The case list. Server Component: it receives already-authorized, already-formatted
 * rows and performs no data access of its own.
 */
export function CaseTable(props: { rows: CaseSummary[] }) {
  return (
    <table className="case-table">
      <caption className="visually-hidden">Cases in your workspace</caption>
      <thead>
        <tr>
          <th scope="col">Case</th>
          <th scope="col">Type</th>
          <th scope="col">Status</th>
          <th scope="col">Priority</th>
          <th scope="col">Received</th>
          <th scope="col">Statutory deadline</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={row.caseNumber}>
            <th scope="row"><a href={`/app/cases/${row.caseNumber}`}>{row.caseNumber}</a></th>
            <td>{row.requestType}</td>
            <td><span className="status" data-status={row.status}>{row.statusLabel}</span></td>
            <td>{row.priority}</td>
            <td>{row.received}</td>
            <td>
              {row.due}
              <span className="deadline" data-deadline={row.deadline.state}>{row.deadline.label}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
