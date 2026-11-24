/**
 * Skeleton rows while the case list loads.
 *
 * Rows, not a spinner: the layout then matches the real table, so the page does not jump
 * when data arrives. Announced politely so a screen reader hears "Loading cases" once
 * rather than a silent gap.
 */
export default function CaseListLoading() {
  return (
    <section className="case-list" aria-busy="true">
      <header className="page-header">
        <div>
          <h1>Cases</h1>
          <p className="subtitle">Loading cases…</p>
        </div>
      </header>
      <p role="status" className="visually-hidden">Loading cases</p>
      <table className="case-table" aria-hidden="true">
        <thead>
          <tr>
            <th scope="col">Case ID</th>
            <th scope="col">Requester</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Owner</th>
            <th scope="col">Received</th>
            <th scope="col">SLA</th>
            <th scope="col">Checklist</th>
            <th scope="col">Priority</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3, 4].map((row) => (
            <tr key={row} className="skeleton-row">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((cell) => (
                <td key={cell}>
                  <span className="skeleton" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
