/**
 * "My tasks" (docs/08 G8): a system owner's assigned systems across open cases. Read-only —
 * each row links into the case's data-source checklist row. There is no prototype mock for
 * this view (recorded as a decision in docs/08); the copy mirrors the sibling "Approvals"
 * empty-state pattern.
 */
import { requireAuth } from "@/server/auth/require-auth";
import { listMyTasks } from "@/server/cases/tasks";
import { formatDate } from "@/server/cases/format";

export const dynamic = "force-dynamic";

export default async function MyTasksPage() {
  const actor = await requireAuth();
  const tasks = await listMyTasks(actor);

  return (
    <div>
      <header>
        <h1>My tasks</h1>
      </header>

      {tasks.length === 0 ? (
        <p className="muted">No tasks are assigned to you. Systems appear here once a case assigns them to you.</p>
      ) : (
        <table className="case-table">
          <thead>
            <tr>
              <th>Case</th>
              <th>System</th>
              <th>Status</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={`${t.caseNumber}-${t.sourceKey}`}>
                <th scope="row">
                  <a href={`/app/cases/${encodeURIComponent(t.caseNumber)}?tab=checklist`}>{t.caseNumber}</a>
                </th>
                <td>{t.systemName}</td>
                <td>
                  <span className="status" data-status={t.status}>
                    {t.status}
                  </span>
                </td>
                <td>{t.taskDueAt ? formatDate(t.taskDueAt) : formatDate(t.statutoryDueAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
