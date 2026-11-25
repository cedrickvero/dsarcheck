/**
 * Case-scoped audit log for the cockpit's Audit tab. Case audit events are written with
 * objectType = "case" and objectId = the case's UUID (see create.ts/bulk.ts), so the listing
 * filters on exactly that within the workspace's RLS scope. Newest first, capped at 200.
 */
import { and, desc, eq } from "drizzle-orm";
import { auditEvents } from "@/db/schema";
import { withTenant } from "@/db/client";
import { can } from "@/server/authz";
import { ForbiddenError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/require-auth";

export interface CaseAuditRow {
  at: Date;
  actorLabel: string;
  action: string;
  category: string;
  reason: string;
  objectId: string | null;
}

export async function listCaseAuditEvents(actor: Actor, caseId: string): Promise<CaseAuditRow[]> {
  if (!actor.roles.some((role) => can(role, "view_and_update_cases"))) {
    throw new ForbiddenError("Your role does not permit viewing cases.");
  }

  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) =>
      tx
        .select({
          at: auditEvents.at,
          actorLabel: auditEvents.actorLabel,
          action: auditEvents.action,
          category: auditEvents.category,
          reason: auditEvents.reason,
          objectId: auditEvents.objectId,
        })
        .from(auditEvents)
        .where(and(eq(auditEvents.objectType, "case"), eq(auditEvents.objectId, caseId)))
        .orderBy(desc(auditEvents.at))
        .limit(200),
  );
}
