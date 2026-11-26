/**
 * Collection & redaction (Access cases) — the non-erasure branch of the "Collection"
 * cockpit tab. Files carry flagged redaction tokens; the handler redacts each (reason +
 * category from the token), requests review, an approver completes the review, and only
 * then may the final redacted export be generated. The original file is never mutated —
 * the export is a NEW version.
 *
 * Rules (docs/05 § Redaction rules): a redaction reason is required (≥3 chars); any new
 * redaction after review resets review to "none"; complete review is approver-gated; the
 * export is rejected until review is "done".
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { cases, caseFiles, redactionTokens } from "@/db/schema";
import { withTenant } from "@/db/client";
import { can } from "@/server/authz";
import { writeAuditEvent } from "@/server/db/audit";
import { ForbiddenError, ValidationError } from "@/server/http/errors";
import { assertKeyInWorkspace, parseObjectKey } from "@/server/storage/objectKey";
import { issueDownloadUrl } from "@/server/storage/signedUrl";
import { workspacePermissionSource } from "@/server/auth/permission-source";
import type { Actor } from "@/server/auth/require-auth";

const MIN_REASON = 3;

export interface CollectionFile {
  id: string;
  sourceKey: string | null;
  name: string;
  type: string;
  sizeBytes: number;
  version: number;
  needsRedaction: boolean;
  isRedactedExport: boolean;
}

export interface CollectionToken {
  id: string;
  fileId: string;
  page: number | null;
  category: string;
  snippet: string;
  flagged: boolean;
  redacted: boolean;
}

export interface CollectionView {
  caseId: string;
  requestType: string;
  redactionReview: "none" | "requested" | "done";
  finalExportDone: boolean;
  files: CollectionFile[];
  tokens: CollectionToken[];
  flaggedCount: number;
  unredactedCount: number;
}

function requirePermission(actor: Actor, permission: Parameters<typeof can>[1], message: string): void {
  if (!actor.roles.some((r) => can(r, permission))) {
    throw new ForbiddenError(message);
  }
}

/** The collection/redaction state machine is for non-erasure cases only (docs/03 E4a). */
function assertCollectionCase(requestType: string): void {
  if (requestType === "Erasure") {
    throw new ValidationError("erasure cases use erasure outcomes, not collection");
  }
}

export async function getCollection(actor: Actor, caseId: string): Promise<CollectionView | null> {
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [row] = await tx
        .select({ id: cases.id, requestType: cases.requestType, redactionReview: cases.redactionReview, finalExportDone: cases.finalExportDone })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) return null;

      const files = await tx
        .select()
        .from(caseFiles)
        .where(eq(caseFiles.caseId, caseId))
        .orderBy(asc(caseFiles.createdAt));
      const tokens = await tx
        .select()
        .from(redactionTokens)
        .where(eq(redactionTokens.caseId, caseId))
        .orderBy(asc(redactionTokens.fileId));

      const flaggedCount = tokens.filter((t) => t.flagged).length;
      const unredactedCount = tokens.filter((t) => t.flagged && !t.redacted).length;

      return {
        caseId,
        requestType: row.requestType,
        redactionReview: row.redactionReview,
        finalExportDone: row.finalExportDone,
        files: files.map((f) => ({
          id: f.id,
          sourceKey: f.sourceKey,
          name: f.name,
          type: f.type,
          sizeBytes: f.sizeBytes,
          version: f.version,
          needsRedaction: f.needsRedaction,
          isRedactedExport: f.isRedactedExport,
        })),
        tokens: tokens.map((t) => ({
          id: t.id,
          fileId: t.fileId,
          page: t.page,
          category: t.category,
          snippet: t.snippet,
          flagged: t.flagged,
          redacted: t.redacted,
        })),
        flaggedCount,
        unredactedCount,
      };
    },
  );
}

/** Redact (or un-redact) one flagged token. Requires a reason; resets the review. */
export async function recordRedaction(
  actor: Actor,
  caseId: string,
  input: { tokenId: string; redacted: boolean; reason: string },
): Promise<{ redacted: boolean }> {
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) {
    throw new ValidationError("A redaction reason is required.");
  }

  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      requirePermission(actor, "view_and_update_cases", "Your role does not permit redacting data.");

      const [caseRow] = await tx
        .select({ requestType: cases.requestType })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!caseRow) throw new ValidationError("unknown case");
      assertCollectionCase(caseRow.requestType);

      const [token] = await tx
        .select()
        .from(redactionTokens)
        .where(and(eq(redactionTokens.id, input.tokenId), eq(redactionTokens.caseId, caseId), eq(redactionTokens.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!token) throw new ValidationError("unknown token");

      await tx
        .update(redactionTokens)
        .set({ redacted: input.redacted })
        .where(eq(redactionTokens.id, token.id));

      // Any new redaction invalidates a pending or completed review (docs/05).
      if (token.redacted !== input.redacted) {
        const [row] = await tx
          .select({ review: cases.redactionReview })
          .from(cases)
          .where(eq(cases.id, caseId))
          .limit(1);
        if (row && row.review !== "none") {
          await tx
            .update(cases)
            .set({ redactionReview: "none", finalExportDone: false })
            .where(eq(cases.id, caseId));
        }
      }

      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: "redaction.recorded",
        category: "Redaction",
        reason,
        objectType: "case",
        objectId: caseId,
        meta: {
          tokenId: token.id,
          fileId: token.fileId,
          category: token.category,
          snippet: token.snippet,
          redacted: input.redacted,
        },
      });

      return { redacted: input.redacted };
    },
  );
}

export async function requestRedactionReview(actor: Actor, caseId: string): Promise<{ review: string }> {
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      requirePermission(actor, "view_and_update_cases", "Your role does not permit requesting a redaction review.");

      const [row] = await tx
        .select({ id: cases.id, review: cases.redactionReview, requestType: cases.requestType })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) throw new ValidationError("unknown case");
      assertCollectionCase(row.requestType);
      if (row.review !== "none") {
        throw new ValidationError("a review is already in progress or complete");
      }

      await tx.update(cases).set({ redactionReview: "requested" }).where(eq(cases.id, caseId));

      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: "redaction.review.requested",
        category: "Redaction",
        reason: "Review requested",
        objectType: "case",
        objectId: caseId,
        meta: { caseId },
      });

      return { review: "requested" };
    },
  );
}

export async function completeRedactionReview(
  actor: Actor,
  caseId: string,
  input: { reason: string },
): Promise<{ review: string }> {
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) {
    throw new ValidationError("A reason is required to complete the review.");
  }

  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      requirePermission(actor, "complete_redaction_review", "Only an approver can complete the redaction review.");

      const [row] = await tx
        .select({ id: cases.id, review: cases.redactionReview, requestType: cases.requestType })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) throw new ValidationError("unknown case");
      assertCollectionCase(row.requestType);
      if (row.review !== "requested") {
        throw new ValidationError("no review is awaiting completion");
      }

      const pending = await tx
        .select({ id: redactionTokens.id })
        .from(redactionTokens)
        .where(and(eq(redactionTokens.caseId, caseId), eq(redactionTokens.flagged, true), eq(redactionTokens.redacted, false)))
        .limit(1);
      if (pending.length > 0) {
        throw new ValidationError("flagged items are not yet redacted");
      }

      await tx.update(cases).set({ redactionReview: "done" }).where(eq(cases.id, caseId));

      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: "redaction.review.completed",
        category: "Redaction",
        reason,
        objectType: "case",
        objectId: caseId,
        meta: { caseId },
      });

      return { review: "done" };
    },
  );
}

export interface RecordRedactedExportInput {
  name: string;
  type: string;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
}

/**
 * Record the human-produced redacted export (docs/04 CaseFile.is_redacted_export): a NEW
 * case_files row (version 2, never an overwrite of the original) that references the object
 * already stored under `storageKey`, plus the finalExportDone flag — in one transaction with
 * the audit event. RBAC + review-done gate mirror the old flag-only path this replaced.
 */
export async function recordRedactedExport(
  actor: Actor,
  caseId: string,
  input: RecordRedactedExportInput,
): Promise<{ finalExportDone: boolean; fileId: string }> {
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      requirePermission(actor, "export_evidence_packs", "Your role does not permit generating the final export.");

      const [row] = await tx
        .select({ id: cases.id, review: cases.redactionReview, requestType: cases.requestType })
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) throw new ValidationError("unknown case");
      assertCollectionCase(row.requestType);
      if (row.review !== "done") {
        throw new ValidationError("the redaction review must be completed before the export");
      }

      const name = input.name.trim();
      const storageKey = input.storageKey.trim();
      const sha256 = input.sha256.trim().toLowerCase();
      if (name === "") throw new ValidationError("a file name is required");
      if (storageKey === "") throw new ValidationError("a storage key is required");
      if (!/^[0-9a-f]{64}$/.test(sha256)) throw new ValidationError("a valid sha256 is required");
      if (!Number.isFinite(input.sizeBytes) || input.sizeBytes < 0) {
        throw new ValidationError("sizeBytes must be a non-negative number");
      }
      // The key must be a tenant-scoped redacted-export key, same rule as every other object
      // (ws/<workspaceId>/<purpose>/<uuid>); a key for another workspace or purpose is refused.
      let parts;
      try {
        parts = assertKeyInWorkspace(storageKey, actor.workspaceId);
      } catch {
        throw new ValidationError("storage key must be scoped to this workspace");
      }
      if (parts.purpose !== "redacted_export") {
        throw new ValidationError("storage key purpose must be redacted_export");
      }

      const [file] = await tx
        .insert(caseFiles)
        .values({
          orgId: actor.orgId,
          workspaceId: actor.workspaceId,
          caseId,
          name,
          type: input.type,
          sizeBytes: input.sizeBytes,
          uploadedBy: actor.userId,
          storageKey,
          sha256,
          version: 2,
          needsRedaction: false,
          isRedactedExport: true,
          isEvidence: false,
        })
        .returning({ id: caseFiles.id });

      await tx.update(cases).set({ finalExportDone: true }).where(eq(cases.id, caseId));

      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: "redaction.export.generated",
        category: "Redaction",
        reason: "Final redacted export recorded",
        objectType: "case",
        objectId: caseId,
        meta: { caseId, fileId: file!.id, storageKey, sha256 },
      });

      return { finalExportDone: true, fileId: file!.id };
    },
  );
}

/**
 * "Open original · logged" (docs/05 § Redaction rules): viewing the unredacted original is a
 * reason-required, per-viewer audited action. It writes the immutable audit event AND mints a
 * short-lived signed download URL (R2 contract) — the original bytes never reach the browser
 * without this reason + audit first. The key's own purpose segment is the authorized purpose,
 * so the mint can never authorize the wrong object.
 */
export async function openOriginalFile(actor: Actor, caseId: string, fileId: string, reason: string): Promise<{ url: string }> {
  const trimmed = reason.trim();
  if (trimmed.length < MIN_REASON) {
    throw new ValidationError("a reason of at least 3 characters is required");
  }

  const storageKey = await withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      requirePermission(actor, "export_evidence_packs", "Your role does not permit opening original files.");

      const [file] = await tx
        .select({ name: caseFiles.name, storageKey: caseFiles.storageKey })
        .from(caseFiles)
        .where(and(eq(caseFiles.id, fileId), eq(caseFiles.workspaceId, actor.workspaceId), eq(caseFiles.caseId, caseId)))
        .limit(1);
      if (!file) throw new ValidationError("unknown file");
      if (!file.storageKey) throw new ValidationError("unknown file");

      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: "Original file opened",
        category: "Redaction",
        reason: trimmed,
        objectType: "case_file",
        objectId: fileId,
        meta: { caseId, fileName: file.name },
      });

      return file.storageKey;
    },
  );

  const issued = await issueDownloadUrl({
    actor,
    reason: trimmed,
    requestId: randomUUID(),
    permissions: workspacePermissionSource,
    purpose: parseObjectKey(storageKey).purpose,
    objectKey: storageKey,
  });
  return { url: issued.url };
}
