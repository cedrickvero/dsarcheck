/**
 * The identity verification facts for a case, and the guarded decision. The recorded
 * decision is DERIVED from the audit log (the "Identity approved/rejected/more info" event),
 * so the tab's decision box and the audit history can never disagree.
 *
 * docs/05: high-risk cases may only be approved or rejected by an approver (owner or
 * workspace_admin included); a handler may request more information. Approve moves
 * New/Verifying -> In progress, reject closes the case, and requesting information keeps it
 * in Verifying with infoRequested set.
 */
import { and, desc, eq } from "drizzle-orm";
import { auditEvents, cases } from "@/db/schema";
import { withTenant } from "@/db/client";
import { can } from "@/server/authz";
import { writeAuditEvent } from "@/server/db/audit";
import { ForbiddenError, ValidationError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/require-auth";

const MIN_REASON = 3;

export type IdentityDecision = "approve" | "reject" | "request_info";

export interface IdentityRecord {
  emailConfirmedAt: Date | null;
  identifierMatch: string;
  identifierNote: string;
  idDocumentProvided: boolean;
  identityVerified: boolean;
  infoRequested: boolean;
  risk: string;
  decision: {
    decision: IdentityDecision;
    infoOption: string | null;
    by: string;
    at: Date;
    reason: string;
  } | null;
}

const APPROVE_ACTIONS: Record<IdentityDecision, { action: string; category: string }> = {
  approve: { action: "Identity approved", category: "Identity" },
  reject: { action: "Identity rejected", category: "Identity" },
  request_info: { action: "More information requested", category: "Identity" },
};

/** Approver-or-above: the roles docs/05 allows to approve/reject a high-risk identity. */
function isApprover(actor: Actor): boolean {
  return actor.roles.some((role) => ["owner", "workspace_admin", "approver"].includes(role));
}

function assertMayDecideIdentity(actor: Actor): void {
  if (!actor.roles.some((role) => can(role, "approve_identity"))) {
    throw new ForbiddenError("Your role does not permit identity decisions.");
  }
}

export async function getIdentity(actor: Actor, caseId: string): Promise<IdentityRecord | null> {
  const rows = await withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [row] = await tx
        .select({
          emailConfirmedAt: cases.emailConfirmedAt,
          identifierMatch: cases.identifierMatch,
          identifierNote: cases.identifierNote,
          idDocumentProvided: cases.idDocumentProvided,
          identityVerified: cases.identityVerified,
          infoRequested: cases.infoRequested,
          risk: cases.risk,
        })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) return null;

      const [event] = await tx
        .select({
          actorLabel: auditEvents.actorLabel,
          at: auditEvents.at,
          reason: auditEvents.reason,
          meta: auditEvents.meta,
        })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.objectType, "case"),
            eq(auditEvents.objectId, caseId),
            eq(auditEvents.category, "Identity"),
          ),
        )
        .orderBy(desc(auditEvents.at))
        .limit(1);

      return {
        ...row,
        decision: event
          ? {
              decision: (event.meta?.decision as IdentityDecision) ?? "request_info",
              infoOption: (event.meta?.infoOption as string) ?? null,
              by: event.actorLabel,
              at: event.at,
              reason: event.reason,
            }
          : null,
      };
    },
  );
  return rows;
}

export interface RecordIdentityDecisionInput {
  decision: IdentityDecision;
  reason: string;
  infoOption?: string;
}

export async function recordIdentityDecision(
  actor: Actor,
  caseId: string,
  input: RecordIdentityDecisionInput,
): Promise<{ status: string; identityVerified: boolean }> {
  assertMayDecideIdentity(actor);

  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) {
    throw new ValidationError("a reason is required for an identity decision");
  }
  const infoOption = (input.infoOption ?? "").trim() || null;

  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [row] = await tx
        .select({ status: cases.status, risk: cases.risk })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) throw new ValidationError("unknown case");

      if (row.status !== "New" && row.status !== "Verifying") {
        throw new ValidationError("identity has already been decided for this case");
      }
      if (row.risk === "High" && input.decision !== "request_info" && !isApprover(actor)) {
        throw new ForbiddenError("High-risk identity needs an approver to decide");
      }

      const status =
        input.decision === "approve" ? "In progress" : input.decision === "reject" ? "Rejected" : "Verifying";
      const identityVerified = input.decision === "approve";
      const infoRequested = input.decision === "request_info";

      await tx
        .update(cases)
        .set({
          status,
          identityVerified,
          infoRequested,
          closedAt: input.decision === "reject" ? new Date() : null,
        })
        .where(eq(cases.id, caseId));

      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: APPROVE_ACTIONS[input.decision].action,
        category: APPROVE_ACTIONS[input.decision].category,
        reason,
        objectType: "case",
        objectId: caseId,
        meta: { decision: input.decision, infoOption },
      });

      return { status, identityVerified };
    },
  );
}
