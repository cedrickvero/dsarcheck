/**
 * Agency dashboard (docs/03 § B): the org-level view an agency owner/admin sees across all
 * their client workspaces. The multi-workspace model is the `memberships` table (org-scoped
 * RLS); each client workspace's case stats are read one at a time by switching the tenant GUC
 * to that workspace, so per-workspace RLS still holds on every read. The workspace switcher
 * (changing the actor's *active* workspace) is a follow-on slice, not this one.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { memberships, orgs } from "@/db/schema";
import { withTenant, type Transaction } from "@/db/client";
import type { Actor } from "@/server/auth/require-auth";

export interface AgencyClientRow {
  workspaceId: string;
  name: string;
  open: number;
  dueSoon: number;
  overdue: number;
  awaitingApproval: number;
  actionRequired: number;
  highRisk: number;
  completedThisMonth: number;
  avgClosureDays: number | null;
  nextDeadline: { caseNumber: string; dueAt: Date } | null;
}

export interface AgencyDashboard {
  orgName: string;
  totalOpen: number;
  dueSoon: number;
  overdue: number;
  awaitingApproval: number;
  actionRequired: number;
  highRisk: number;
  completedThisMonth: number;
  avgClosureDays: number | null;
  clients: AgencyClientRow[];
}

type StatRow = {
  open: number;
  due_soon: number;
  overdue: number;
  awaiting: number;
  action_required: number;
  high_risk: number;
  completed_month: number;
  closed_count: number;
  // Postgres `numeric` (from sum(EXTRACT(EPOCH...))) surfaces as a STRING via the pg
  // driver; coerced to number in workspaceStats's return shape (see WorkspaceStats).
  closure_days_total: string | null;
};

/** The coerced per-workspace stats: raw SQL values are mapped to JS numbers at the boundary. */
type WorkspaceStats = Omit<StatRow, "closure_days_total"> & {
  closure_days_total: number | null;
  nextDeadline: AgencyClientRow["nextDeadline"];
};

async function workspaceStats(tx: Transaction, workspaceId: string): Promise<WorkspaceStats> {
  await tx.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);

  const stats = await tx.execute<StatRow>(sql`
    SELECT
      count(*) FILTER (WHERE status NOT IN ('Completed','Rejected'))::int AS open,
      count(*) FILTER (WHERE status NOT IN ('Completed','Rejected') AND statutory_due_at < now() + interval '7 days' AND statutory_due_at >= now())::int AS due_soon,
      count(*) FILTER (WHERE status NOT IN ('Completed','Rejected') AND statutory_due_at < now())::int AS overdue,
      count(*) FILTER (WHERE status = 'Awaiting approval')::int AS awaiting,
      (SELECT count(*)::int FROM case_systems WHERE status = 'Action required') AS action_required,
      (SELECT count(*)::int FROM cases WHERE risk = 'High' AND NOT identity_verified AND status NOT IN ('Completed','Rejected')) AS high_risk,
      (SELECT count(*)::int FROM cases WHERE closed_at IS NOT NULL AND closed_at >= date_trunc('month', now())) AS completed_month,
      count(*) FILTER (WHERE closed_at IS NOT NULL)::int AS closed_count,
      sum(EXTRACT(EPOCH FROM (closed_at - received_at))/86400) FILTER (WHERE closed_at IS NOT NULL) AS closure_days_total
    FROM cases
  `);

  const next = await tx.execute<{ case_number: string; statutory_due_at: string | null }>(sql`
    SELECT case_number, statutory_due_at FROM cases
    WHERE status NOT IN ('Completed','Rejected')
    ORDER BY statutory_due_at ASC
    LIMIT 1
  `);

  const s = stats.rows[0];
  const n = next.rows[0];
  return {
    open: s?.open ?? 0,
    due_soon: s?.due_soon ?? 0,
    overdue: s?.overdue ?? 0,
    awaiting: s?.awaiting ?? 0,
    action_required: s?.action_required ?? 0,
    high_risk: s?.high_risk ?? 0,
    completed_month: s?.completed_month ?? 0,
    closed_count: s?.closed_count ?? 0,
    closure_days_total: s?.closure_days_total == null ? null : Number(s.closure_days_total),
    nextDeadline: n && n.statutory_due_at ? { caseNumber: n.case_number, dueAt: new Date(n.statutory_due_at) } : null,
  };
}

export async function getAgencyDashboard(actor: Actor): Promise<AgencyDashboard | null> {
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [org] = await tx.select({ kind: orgs.kind, name: orgs.name }).from(orgs).where(eq(orgs.id, actor.orgId)).limit(1);
      if (!org || org.kind !== "agency") return null;

      // Only an agency owner/admin sees the cross-client view; anyone else gets their own
      // workspace's direct dashboard (the page falls through when this returns null).
      if (!actor.roles.some((r) => r === "owner" || r === "workspace_admin")) return null;

      const members = await tx
        .select({ workspaceId: memberships.workspaceId, name: memberships.workspaceName })
        .from(memberships)
        .where(and(eq(memberships.orgId, actor.orgId), eq(memberships.userId, actor.userId), eq(memberships.active, true)))
        .orderBy(asc(memberships.workspaceName));

      // Dedupe by workspace (a workspace may have several members) and accumulate the
      // weighted org average (sum of closure days / sum of closed cases, not a mean of means).
      const byId = new Map<string, string>();
      for (const m of members) if (!byId.has(m.workspaceId)) byId.set(m.workspaceId, m.name);

      const clients: AgencyClientRow[] = [];
      let totalClosed = 0;
      let totalClosureDays = 0;
      for (const [workspaceId, name] of byId) {
        const s = await workspaceStats(tx, workspaceId);
        totalClosed += s.closed_count;
        totalClosureDays += s.closure_days_total ?? 0;
        clients.push({
          workspaceId,
          name,
          open: s.open,
          dueSoon: s.due_soon,
          overdue: s.overdue,
          awaitingApproval: s.awaiting,
          actionRequired: s.action_required,
          highRisk: s.high_risk,
          completedThisMonth: s.completed_month,
          avgClosureDays: s.closed_count > 0 ? (s.closure_days_total ?? 0) / s.closed_count : null,
          nextDeadline: s.nextDeadline,
        });
      }

      return {
        orgName: org.name,
        totalOpen: clients.reduce((s, c) => s + c.open, 0),
        dueSoon: clients.reduce((s, c) => s + c.dueSoon, 0),
        overdue: clients.reduce((s, c) => s + c.overdue, 0),
        awaitingApproval: clients.reduce((s, c) => s + c.awaitingApproval, 0),
        actionRequired: clients.reduce((s, c) => s + c.actionRequired, 0),
        highRisk: clients.reduce((s, c) => s + c.highRisk, 0),
        completedThisMonth: clients.reduce((s, c) => s + c.completedThisMonth, 0),
        avgClosureDays: totalClosed > 0 ? totalClosureDays / totalClosed : null,
        clients,
      };
    },
  );
}
