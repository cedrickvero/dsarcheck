/**
 * Approval & response: the pre-closure checklist (ported checks()), the response template
 * and preview (ported respText()), and the four workflow transitions. Every transition is a
 * sensitive action - the row update and its audit event are ONE transaction.
 *
 * State machine (docs/05): send-for-approval moves In progress/Extended -> Awaiting approval
 * only when every pre-closure check passes; then an approver approves-and-closes
 * (-> Completed + closed_at), requests changes (-> In progress) or rejects (-> Rejected +
 * closed_at). approve-and-close re-checks the checklist, because it can have drifted since
 * send-for-approval.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { auditEvents, cases, caseSystems, redactionTokens, users, workspaces } from "@/db/schema";
import { withTenant, type Transaction } from "@/db/client";
import { can } from "@/server/authz";
import { writeAuditEvent } from "@/server/db/audit";
import { ForbiddenError, ValidationError } from "@/server/http/errors";
import type { Actor } from "@/server/auth/require-auth";
import { checks, type PreClosureChecks } from "@/domain/checks";
import { respText, RESPONSE_TEMPLATES } from "@/domain/respText";
import type { CaseSystemState, ErasureOutcome as DomainErasureOutcome } from "@/domain/types";
import { isErasureOutcome, outcomeRule } from "@/server/erasure/outcomes";
import { CHECKLIST_STATUS_BY_OUTCOME } from "./erasure";
import { insertEvidencePackVersion } from "./evidence";

const MIN_REASON = 3;

export interface ApprovalHistoryRow {
  action: string;
  by: string;
  at: Date;
  reason: string;
}

export interface ApprovalView {
  caseId: string;
  status: string;
  template: string;
  checks: PreClosureChecks;
  responsePreview: string;
  history: ApprovalHistoryRow[];
  canSendForApproval: boolean;
  canDecideClosure: boolean;
}

function assertMaySend(actor: Actor): void {
  if (!actor.roles.some((r) => can(r, "view_and_update_cases"))) {
    throw new ForbiddenError("Your role does not permit working cases.");
  }
}

function assertMayDecideClosure(actor: Actor): void {
  if (!actor.roles.some((r) => can(r, "approve_closure"))) {
    throw new ForbiddenError("Your role does not permit approving closure.");
  }
}

interface CaseRowNeeded {
  id: string;
  caseNumber: string;
  requestType: string;
  status: string;
  requesterName: string;
  receivedAt: Date;
  ownerId: string | null;
  identityVerified: boolean;
  template: string;
  redactionReview: string;
  finalExportDone: boolean;
}

interface SystemRow {
  sourceKey: string;
  name: string;
  status: string;
  evidenceCount: number;
  reason: string;
  exceptionCategory: string | null;
  outcome: string | null;
}

/** Map DB system rows to the domain shape. For an erasure case the checklist status is
 *  DERIVED from the outcome (an undecided system reads as open work, "Action required"
 *  blocks), so the seed-parity checks() gates closure correctly; the outcome itself is
 *  passed as its display label so respText() renders the erasure letter. */
function toDomainSystems(sysRows: SystemRow[], isErasure: boolean): CaseSystemState[] {
  return sysRows.map((s) => {
    const outcome = isErasureOutcome(s.outcome) ? s.outcome : null;
    const status = isErasure
      ? outcome
        ? CHECKLIST_STATUS_BY_OUTCOME[outcome]
        : "In progress"
      : s.status;
    return {
      key: s.sourceKey,
      status: status as CaseSystemState["status"],
      outcome: outcome ? (outcomeRule(outcome).label as CaseSystemState["outcome"]) : null,
      evidence: s.evidenceCount > 0 ? [""] : [],
      reason: s.reason,
      exceptionCategory: s.exceptionCategory as CaseSystemState["exceptionCategory"],
    };
  });
}

async function buildChecks(
  tx: Transaction,
  actor: Actor,
  row: CaseRowNeeded,
  sysRows: SystemRow[],
): Promise<PreClosureChecks> {
  let ownerName = "Unassigned";
  if (row.ownerId) {
    const [owner] = await tx.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, row.ownerId)).limit(1);
    if (owner) ownerName = owner.name || owner.email;
  }
  const tokens = await tx
    .select({ flagged: redactionTokens.flagged, redacted: redactionTokens.redacted })
    .from(redactionTokens)
    .where(eq(redactionTokens.caseId, row.id));
  return checks({
    type: row.requestType as "Access",
    idVerified: row.identityVerified,
    systems: toDomainSystems(sysRows, row.requestType === "Erasure"),
    tokens,
    template: row.template,
    redactionReview: row.redactionReview as "none" | "requested" | "done",
    finalExportDone: row.finalExportDone,
    ownerName,
    idDecision: null,
  });
}

export async function getApproval(actor: Actor, caseId: string): Promise<ApprovalView | null> {
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [row] = await tx
        .select({
          id: cases.id,
          caseNumber: cases.caseNumber,
          requestType: cases.requestType,
          status: cases.status,
          requesterName: cases.requesterName,
          receivedAt: cases.receivedAt,
          ownerId: cases.ownerId,
          identityVerified: cases.identityVerified,
          template: cases.template,
          redactionReview: cases.redactionReview,
          finalExportDone: cases.finalExportDone,
        })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) return null;

      const sysRows = await tx
        .select({
          sourceKey: caseSystems.sourceKey,
          name: caseSystems.name,
          status: caseSystems.status,
          evidenceCount: caseSystems.evidenceCount,
          reason: caseSystems.reason,
          exceptionCategory: caseSystems.exceptionCategory,
          outcome: caseSystems.outcome,
        })
        .from(caseSystems)
        .where(eq(caseSystems.caseId, caseId))
        .orderBy(asc(caseSystems.sourceKey));

      const [ws] = await tx.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, actor.workspaceId)).limit(1);
      const senderName = ws?.name ?? "This workspace";

      const preChecks = await buildChecks(tx, actor, row, sysRows);
      const preview = respText(
        {
          id: row.caseNumber,
          name: row.requesterName || "there",
          type: row.requestType,
          receivedAt: row.receivedAt,
          template: row.template || null,
          systems: sysRows.map((s) => ({
            key: s.sourceKey,
            outcome: isErasureOutcome(s.outcome)
              ? (outcomeRule(s.outcome).label as DomainErasureOutcome)
              : null,
          })),
        },
        { sender: senderName },
        sysRows.map((s) => ({ key: s.sourceKey, name: s.name })),
      );

      const history = await tx
        .select({ action: auditEvents.action, by: auditEvents.actorLabel, at: auditEvents.at, reason: auditEvents.reason })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.objectType, "case"),
            eq(auditEvents.objectId, caseId),
            eq(auditEvents.category, "Approval"),
          ),
        )
        .orderBy(desc(auditEvents.at))
        .limit(20);

      return {
        caseId,
        status: row.status,
        template: row.template,
        checks: preChecks,
        responsePreview: preview,
        history,
        canSendForApproval: actor.roles.some((r) => can(r, "view_and_update_cases")),
        canDecideClosure: actor.roles.some((r) => can(r, "approve_closure")),
      };
    },
  );
}

export async function selectTemplate(
  actor: Actor,
  caseId: string,
  template: string,
): Promise<{ template: string }> {
  assertMaySend(actor);
  if (!(RESPONSE_TEMPLATES as readonly string[]).includes(template)) {
    throw new ValidationError("unknown response template");
  }
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [row] = await tx
        .select({ id: cases.id })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) throw new ValidationError("unknown case");

      await tx.update(cases).set({ template }).where(eq(cases.id, caseId));
      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: `Response template set to "${template}"`,
        category: "Approval",
        reason: `Response template set to "${template}"`,
        objectType: "case",
        objectId: caseId,
        meta: { template },
      });
      return { template };
    },
  );
}

export async function sendForApproval(actor: Actor, caseId: string, reason: string): Promise<{ status: string }> {
  assertMaySend(actor);
  const trimmed = reason.trim();
  if (trimmed.length < MIN_REASON) throw new ValidationError("a reason is required to send for approval");

  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [row] = await tx
        .select({
          id: cases.id,
          caseNumber: cases.caseNumber,
          requestType: cases.requestType,
          status: cases.status,
          requesterName: cases.requesterName,
          receivedAt: cases.receivedAt,
          ownerId: cases.ownerId,
          identityVerified: cases.identityVerified,
          template: cases.template,
          redactionReview: cases.redactionReview,
          finalExportDone: cases.finalExportDone,
        })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) throw new ValidationError("unknown case");
      if (row.status !== "In progress" && row.status !== "Extended") {
        throw new ValidationError("this case cannot be sent for approval");
      }

      const sysRows = await tx
        .select({
          sourceKey: caseSystems.sourceKey,
          name: caseSystems.name,
          status: caseSystems.status,
          evidenceCount: caseSystems.evidenceCount,
          reason: caseSystems.reason,
          exceptionCategory: caseSystems.exceptionCategory,
          outcome: caseSystems.outcome,
        })
        .from(caseSystems)
        .where(eq(caseSystems.caseId, caseId))
        .orderBy(asc(caseSystems.sourceKey));

      const preChecks = await buildChecks(tx, actor, row, sysRows);
      if (!preChecks.allPass) {
        throw new ValidationError(`closure is blocked: ${preChecks.blockers.length} item(s) remain`);
      }

      await tx.update(cases).set({ status: "Awaiting approval" }).where(eq(cases.id, caseId));
      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: "Sent for approval",
        category: "Approval",
        reason: trimmed,
        objectType: "case",
        objectId: caseId,
      });
      return { status: "Awaiting approval" };
    },
  );
}

async function decideClosure(
  actor: Actor,
  caseId: string,
  input: { decision: "approve" | "changes" | "reject"; reason: string },
): Promise<{ status: string }> {
  assertMayDecideClosure(actor);
  const trimmed = input.reason.trim();
  if (trimmed.length < MIN_REASON) throw new ValidationError("a reason is required");

  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [row] = await tx
        .select({
          id: cases.id,
          caseNumber: cases.caseNumber,
          requestType: cases.requestType,
          status: cases.status,
          requesterName: cases.requesterName,
          receivedAt: cases.receivedAt,
          ownerId: cases.ownerId,
          identityVerified: cases.identityVerified,
          template: cases.template,
          redactionReview: cases.redactionReview,
          finalExportDone: cases.finalExportDone,
        })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) throw new ValidationError("unknown case");
      if (row.status !== "Awaiting approval") {
        throw new ValidationError("only a case awaiting approval can be decided");
      }

      if (input.decision === "approve") {
        const sysRows = await tx
          .select({
            sourceKey: caseSystems.sourceKey,
            name: caseSystems.name,
            status: caseSystems.status,
            evidenceCount: caseSystems.evidenceCount,
            reason: caseSystems.reason,
            exceptionCategory: caseSystems.exceptionCategory,
            outcome: caseSystems.outcome,
          })
          .from(caseSystems)
          .where(eq(caseSystems.caseId, caseId))
          .orderBy(asc(caseSystems.sourceKey));
        const preChecks = await buildChecks(tx, actor, row, sysRows);
        if (!preChecks.allPass) {
          throw new ValidationError(`closure is blocked: ${preChecks.blockers.length} item(s) remain`);
        }
      }

      const status = input.decision === "approve" ? "Completed" : input.decision === "reject" ? "Rejected" : "In progress";
      const action =
        input.decision === "approve" ? "Approved and closed" : input.decision === "reject" ? "Rejected" : "Changes requested";

      await tx
        .update(cases)
        .set({
          status,
          closedAt: input.decision === "approve" || input.decision === "reject" ? new Date() : null,
          // docs/05: a rejection uses the Refusal response template.
          template: input.decision === "reject" ? "Refusal — documented reason" : row.template,
        })
        .where(eq(cases.id, caseId));

      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action,
        category: "Approval",
        reason: trimmed,
        objectType: "case",
        objectId: caseId,
      });

      // docs/05: approval auto-creates a FINAL evidence-pack version.
      if (input.decision === "approve") {
        await insertEvidencePackVersion(tx, actor, caseId, false);
      }

      return { status };
    },
  );
}

export function approveAndClose(actor: Actor, caseId: string, reason: string): Promise<{ status: string }> {
  return decideClosure(actor, caseId, { decision: "approve", reason });
}
export function requestChanges(actor: Actor, caseId: string, reason: string): Promise<{ status: string }> {
  return decideClosure(actor, caseId, { decision: "changes", reason });
}
export function rejectCase(actor: Actor, caseId: string, reason: string): Promise<{ status: string }> {
  return decideClosure(actor, caseId, { decision: "reject", reason });
}
