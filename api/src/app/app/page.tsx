/** Dashboard. Counts are derived from the same authorized read the list uses. */
import { requireAuth } from "@/server/auth/require-auth";
import { listCases } from "@/server/cases/query";
import { CASE_STATUSES } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await requireAuth();
  const cases = await listCases(actor);
  const counts = CASE_STATUSES.map((status) => ({
    status,
    n: cases.filter((c) => c.status === status).length,
  }));

  return (
    <>
      <h1>Dashboard</h1>
      <p>{cases.length} case(s) in this workspace.</p>
      <table className="case-table">
        <caption className="visually-hidden">Cases by status</caption>
        <thead>
          <tr><th scope="col">Status</th><th scope="col">Cases</th></tr>
        </thead>
        <tbody>
          {counts.map((c) => (
            <tr key={c.status}>
              <th scope="row"><span className="status" data-status={c.status}>{c.status}</span></th>
              <td>{c.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
