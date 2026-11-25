/**
 * Evidence pack (docs/03 E6): versioned snapshots of the nine-section document. Generate /
 * Regenerate any time (a draft while the case is open); approval auto-creates a final
 * version. The PDF/ZIP bytes and signed-link sharing are a storage-slice concern — this
 * slice persists the version + content snapshot and renders the document.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { auditEvents, caseFiles, cases, caseSystems, evidencePacks, users, workspaces } from "@/db/schema";
import { withTenant, type Transaction } from "@/db/client";
import { can } from "@/server/authz";
import { writeAuditEvent } from "@/server/db/audit";
import { ForbiddenError, ValidationError } from "@/server/http/errors";
import { formatDateTime } from "@/server/cases/format";
import { buildEvidencePack, type EvidencePackData } from "@/domain/evidence";
import type { Actor } from "@/server/auth/require-auth";

export interface EvidenceVersionRow {
  version: number;
  draft: boolean;
  generatedBy: string | null;
  generatedAt: Date;
}

export interface EvidenceView {
  caseId: string;
  requestType: string;
  versions: EvidenceVersionRow[];
  latest: EvidencePackData | null;
}

async function loadContent(
  tx: Transaction,
  actor: Actor,
  caseId: string,
  draft: boolean,
  generatedAt: Date,
): Promise<EvidencePackData> {
  const [row] = await tx
    .select({
      caseNumber: cases.caseNumber,
      requestType: cases.requestType,
      requesterName: cases.requesterName,
      requesterEmail: cases.requesterEmail,
      identifier: cases.identifier,
      details: cases.details,
      receivedAt: cases.receivedAt,
      statutoryDueAt: cases.statutoryDueAt,
      status: cases.status,
      closedAt: cases.closedAt,
      extensionMonths: cases.extensionMonths,
      emailConfirmedAt: cases.emailConfirmedAt,
      identifierMatch: cases.identifierMatch,
      identifierNote: cases.identifierNote,
      idDocumentProvided: cases.idDocumentProvided,
      identityVerified: cases.identityVerified,
    })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!row) throw new ValidationError("unknown case");

  const [ws] = await tx.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, actor.workspaceId)).limit(1);

  const systems = await tx
    .select({
      sourceKey: caseSystems.sourceKey,
      name: caseSystems.name,
      status: caseSystems.status,
      reason: caseSystems.reason,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(caseSystems)
    .leftJoin(users, eq(users.id, caseSystems.ownerId))
    .where(eq(caseSystems.caseId, caseId))
    .orderBy(asc(caseSystems.sourceKey));

  const evidenceFiles = await tx
    .select({ sourceKey: caseFiles.sourceKey, name: caseFiles.name })
    .from(caseFiles)
    .where(and(eq(caseFiles.caseId, caseId), eq(caseFiles.isEvidence, true)));

  const events = await tx
    .select({
      at: auditEvents.at,
      actor: auditEvents.actorLabel,
      action: auditEvents.action,
      category: auditEvents.category,
      reason: auditEvents.reason,
    })
    .from(auditEvents)
    .where(eq(auditEvents.objectId, caseId))
    .orderBy(asc(auditEvents.at));

  const evidenceBySource = new Map<string, string[]>();
  for (const f of evidenceFiles) {
    const key = f.sourceKey ?? "";
    evidenceBySource.set(key, [...(evidenceBySource.get(key) ?? []), f.name]);
  }

  return buildEvidencePack(
    {
      caseNumber: row.caseNumber,
      requestType: row.requestType,
      requesterName: row.requesterName,
      requesterEmail: row.requesterEmail,
      identifier: row.identifier,
      details: row.details,
      receivedAt: formatDateTime(row.receivedAt),
      statutoryDueAt: formatDateTime(row.statutoryDueAt),
      status: row.status,
      closedAt: row.closedAt ? formatDateTime(row.closedAt) : null,
      extensionMonths: row.extensionMonths,
      emailVerification: row.emailConfirmedAt ? "Confirmed" : "Pending",
      identifierMatch: row.identifierMatch || "—",
      identifierNote: row.identifierNote,
      idDocumentProvided: row.idDocumentProvided,
      identityVerified: row.identityVerified,
      clientName: ws?.name ?? "",
      systems: systems.map((s) => ({
        name: s.name,
        owner: s.ownerName || s.ownerEmail || "Unassigned",
        status: s.status,
        evidence: evidenceBySource.get(s.sourceKey) ?? [],
        reason: s.reason,
      })),
      audit: events.map((e) => ({
        at: formatDateTime(e.at),
        actor: e.actor,
        action: e.action,
        category: e.category,
        reason: e.reason,
      })),
    },
    draft,
    formatDateTime(generatedAt),
  );
}

async function nextVersion(tx: Transaction, caseId: string): Promise<number> {
  const rows = await tx.select({ version: evidencePacks.version }).from(evidencePacks).where(eq(evidencePacks.caseId, caseId));
  return rows.reduce((m, r) => Math.max(m, r.version), 0) + 1;
}

/** Inserts a new pack version inside the caller's transaction and writes the audit event.
 *  Used both by the standalone generate action and by approve-and-close's auto-final. */
export async function insertEvidencePackVersion(
  tx: Transaction,
  actor: Actor,
  caseId: string,
  draft: boolean,
): Promise<{ version: number }> {
  const version = await nextVersion(tx, caseId);
  const generatedAt = new Date();
  const content = await loadContent(tx, actor, caseId, draft, generatedAt);

  await tx.insert(evidencePacks).values({
    orgId: actor.orgId,
    workspaceId: actor.workspaceId,
    caseId,
    version,
    draft,
    generatedBy: actor.userId,
    generatedAt,
    content,
  });

  await writeAuditEvent(tx, {
    orgId: actor.orgId,
    workspaceId: actor.workspaceId,
    actorId: actor.userId,
    actorLabel: actor.label,
    action: `Evidence pack v${version} generated`,
    category: "Evidence",
    reason: draft ? "Generated" : "Final pack generated on approval",
    objectType: "case",
    objectId: caseId,
    meta: { caseId, version, draft },
  });

  return { version };
}

export async function generateEvidencePack(actor: Actor, caseId: string): Promise<{ version: number; draft: boolean }> {
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      if (!actor.roles.some((r) => can(r, "view_and_update_cases"))) {
        throw new ForbiddenError("Your role does not permit generating an evidence pack.");
      }
      const [row] = await tx
        .select({ status: cases.status })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) throw new ValidationError("unknown case");

      const draft = row.status !== "Completed" && row.status !== "Rejected";
      const { version } = await insertEvidencePackVersion(tx, actor, caseId, draft);
      return { version, draft };
    },
  );
}

export async function getEvidencePack(actor: Actor, caseId: string): Promise<EvidenceView | null> {
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [row] = await tx
        .select({ id: cases.id, requestType: cases.requestType })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) return null;

      const versions = await tx
        .select({
          version: evidencePacks.version,
          draft: evidencePacks.draft,
          generatedBy: evidencePacks.generatedBy,
          generatedAt: evidencePacks.generatedAt,
        })
        .from(evidencePacks)
        .where(eq(evidencePacks.caseId, caseId))
        .orderBy(asc(evidencePacks.version));

      const [latest] = await tx
        .select({ content: evidencePacks.content })
        .from(evidencePacks)
        .where(eq(evidencePacks.caseId, caseId))
        .orderBy(desc(evidencePacks.version))
        .limit(1);

      return {
        caseId,
        requestType: row.requestType,
        versions,
        latest: (latest?.content as EvidencePackData | undefined) ?? null,
      };
    },
  );
}
