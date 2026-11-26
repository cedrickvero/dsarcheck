/**
 * "My tasks" (docs/08 G8): a system owner's assigned systems across open cases in the
 * active workspace, with status, task due date and a link into the case checklist row.
 * Read-only. A system owner sees ONLY their own rows (`ownerId = actor.userId`); any other
 * role gets an empty list (they are never assigned systems).
 */
import { and, asc, eq, notInArray } from "drizzle-orm";
import { cases, caseSystems } from "@/db/schema";
import { withTenant } from "@/db/client";
import type { Actor } from "@/server/auth/require-auth";

export interface MyTaskRow {
  caseNumber: string;
  systemName: string;
  sourceKey: string;
  status: string;
  /** The system-level task due date; null when the checklist row has no own due date. */
  taskDueAt: Date | null;
  /** The case's statutory deadline, the fallback "due" when the task has none. */
  statutoryDueAt: Date;
}

export async function listMyTasks(actor: Actor): Promise<MyTaskRow[]> {
  if (!actor.roles.includes("system_owner")) return [];

  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) =>
      tx
        .select({
          caseNumber: cases.caseNumber,
          systemName: caseSystems.name,
          sourceKey: caseSystems.sourceKey,
          status: caseSystems.status,
          taskDueAt: caseSystems.dueAt,
          statutoryDueAt: cases.statutoryDueAt,
        })
        .from(caseSystems)
        .innerJoin(cases, eq(caseSystems.caseId, cases.id))
        .where(
          and(
            eq(caseSystems.ownerId, actor.userId),
            eq(caseSystems.workspaceId, actor.workspaceId),
            eq(cases.workspaceId, actor.workspaceId),
            notInArray(cases.status, ["Completed", "Rejected"]),
          ),
        )
        .orderBy(asc(cases.statutoryDueAt)),
  );
}
