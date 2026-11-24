/**
 * Dashboard reads. Server-only.
 *
 * One query assembles what the tiles and the attention list need: the case rows joined to
 * their owner, the per-case count of checklist rows in "Action required", and the name of
 * the workspace's approver (the "Awaiting approval by ..." line is about a person, not a
 * role string). Tenant scope and authorization are the same as every other read.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { cases, caseSystems, users } from "@/db/schema";
import { withTenant } from "@/db/client";
import { can } from "@/server/authz";
import { ForbiddenError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/require-auth";
import type { DashboardRow } from "@/domain/dashboard";

export interface DashboardRead {
  rows: DashboardRow[];
  approverName: string;
}

export async function dashboardRows(actor: Actor): Promise<DashboardRead> {
  if (!actor.roles.some((role) => can(role, "view_and_update_cases"))) {
    throw new ForbiddenError("Your role does not permit viewing the dashboard.");
  }

  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [approver] = await tx
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(
          and(
            eq(users.workspaceId, actor.workspaceId),
            eq(users.role, "approver"),
            sql`${users.disabledAt} is null`,
          ),
        )
        .orderBy(asc(users.name), asc(users.email))
        .limit(1);

      const base = await tx
        .select({
          id: cases.id,
          caseNumber: cases.caseNumber,
          requestType: cases.requestType,
          status: cases.status,
          priority: cases.priority,
          risk: cases.risk,
          ownerId: cases.ownerId,
          ownerName: users.name,
          ownerEmail: users.email,
          requesterName: cases.requesterName,
          requesterEmail: cases.requesterEmail,
          receivedAt: cases.receivedAt,
          dueAt: cases.statutoryDueAt,
          extensionMonths: cases.extensionMonths,
          closedAt: cases.closedAt,
        })
        .from(cases)
        .leftJoin(users, eq(users.id, cases.ownerId))
        .where(eq(cases.workspaceId, actor.workspaceId))
        .orderBy(asc(cases.statutoryDueAt), asc(cases.caseNumber));

      const actionRows = await tx
        .select({
          caseId: caseSystems.caseId,
          n: sql<number>`count(*)::int`,
        })
        .from(caseSystems)
        .where(
          and(
            eq(caseSystems.workspaceId, actor.workspaceId),
            eq(caseSystems.status, "Action required"),
          ),
        )
        .groupBy(caseSystems.caseId);

      const actionByCaseId = new Map(actionRows.map((r) => [r.caseId, r.n]));

      const rows: DashboardRow[] = base.map((row) => ({
        caseNumber: row.caseNumber,
        requestType: row.requestType,
        status: row.status,
        priority: row.priority,
        risk: row.risk,
        ownerId: row.ownerId,
        ownerName: row.ownerId ? row.ownerName || row.ownerEmail : null,
        requesterName: row.requesterName,
        requesterEmail: row.requesterEmail,
        receivedAt: row.receivedAt,
        dueAt: row.dueAt,
        extensionMonths: row.extensionMonths as 0 | 1 | 2,
        checklistDone: 0,
        checklistTotal: 0,
        actionRequired: actionByCaseId.get(row.id) ?? 0,
        closedAt: row.closedAt,
        approverName: approver ? approver.name || approver.email : "an approver",
      }));

      return {
        rows,
        approverName: approver ? approver.name || approver.email : "an approver",
      };
    },
  );
}
