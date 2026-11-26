"use server";

/**
 * Server actions for the case list.
 *
 * Both re-authenticate: a server action is a public endpoint, and relying on the page
 * having authenticated the caller would make the action reachable without a session.
 * The authorization matrix, validation, transaction and audit rows all live in
 * `src/server/cases/bulk.ts` - the same code the tests drive directly.
 */
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAuth } from "@/server/auth/require-auth";
import { now } from "@/server/time";
import { bulkAssignOwner, exportCasesCsv } from "@/server/cases/bulk";
import { updateSystemStatus } from "@/server/cases/checklist";
import { recordIdentityDecision as decideIdentity } from "@/server/cases/identity";
import {
  approveAndClose as approveClose,
  rejectCase as rejectClosure,
  requestChanges as reqChanges,
  selectTemplate as setTemplate,
  sendForApproval as sendApproval,
} from "@/server/cases/approval";
import { recordErasureOutcome as recordOutcome } from "@/server/cases/erasure";
import {
  recordRedaction as redact,
  requestRedactionReview as requestReview,
  completeRedactionReview as completeReview,
  recordRedactedExport as recordExport,
  openOriginalFile as openOriginal,
} from "@/server/cases/collection";
import { generateEvidencePack as generatePack } from "@/server/cases/evidence";
import { issueUploadUrl } from "@/server/storage/signedUrl";
import { serverSideEncryption } from "@/server/storage/s3Client";
import { workspacePermissionSource } from "@/server/auth/permission-source";
import { AppError } from "@/server/http/errors";

export interface ActionResult<T> {
  ok: boolean;
  data?: T;
  message?: string;
}

function failure(error: unknown): { ok: false; message: string } {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

export async function assignOwner(input: {
  caseNumbers: string[];
  ownerId: string;
  reason: string;
}): Promise<ActionResult<{ updated: number; ownerName: string }>> {
  try {
    const actor = await requireAuth();
    const result = await bulkAssignOwner(actor, input);
    revalidatePath("/app/cases");
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

export async function exportCases(input: {
  caseNumbers: string[];
  reason: string;
}): Promise<ActionResult<{ csv: string; filename: string; count: number }>> {
  try {
    const actor = await requireAuth();
    const result = await exportCasesCsv(actor, { ...input, now: now() });
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

export async function setSystemStatus(input: {
  caseId: string;
  caseNumber: string;
  sourceKey: string;
  status: string;
  reason: string;
  exceptionCategory?: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    const actor = await requireAuth();
    await updateSystemStatus(actor, input.caseId, {
      sourceKey: input.sourceKey,
      status: input.status,
      reason: input.reason,
      exceptionCategory: input.exceptionCategory,
    });
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: { status: input.status } };
  } catch (error) {
    return failure(error);
  }
}

export async function recordIdentityDecision(input: {
  caseId: string;
  caseNumber: string;
  decision: "approve" | "reject" | "request_info";
  reason: string;
  infoOption?: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    const actor = await requireAuth();
    const result = await decideIdentity(actor, input.caseId, {
      decision: input.decision,
      reason: input.reason,
      infoOption: input.infoOption,
    });
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: { status: result.status } };
  } catch (error) {
    return failure(error);
  }
}

export async function selectTemplate(input: {
  caseId: string;
  caseNumber: string;
  template: string;
}): Promise<ActionResult<{ template: string }>> {
  try {
    const actor = await requireAuth();
    const result = await setTemplate(actor, input.caseId, input.template);
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

export async function sendForApproval(input: {
  caseId: string;
  caseNumber: string;
  reason: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    const actor = await requireAuth();
    const result = await sendApproval(actor, input.caseId, input.reason);
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

export async function approveAndClose(input: {
  caseId: string;
  caseNumber: string;
  reason: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    const actor = await requireAuth();
    const result = await approveClose(actor, input.caseId, input.reason);
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

export async function requestChanges(input: {
  caseId: string;
  caseNumber: string;
  reason: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    const actor = await requireAuth();
    const result = await reqChanges(actor, input.caseId, input.reason);
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

export async function rejectCase(input: {
  caseId: string;
  caseNumber: string;
  reason: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    const actor = await requireAuth();
    const result = await rejectClosure(actor, input.caseId, input.reason);
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

export async function recordErasureOutcome(input: {
  caseId: string;
  caseNumber: string;
  sourceKey: string;
  outcome: string;
  reason: string;
  exceptionCategory?: string;
  hasOutcomeRecord?: boolean;
}): Promise<ActionResult<{ outcome: string }>> {
  try {
    const actor = await requireAuth();
    const result = await recordOutcome(actor, input.caseId, {
      sourceKey: input.sourceKey,
      outcome: input.outcome,
      reason: input.reason,
      exceptionCategory: input.exceptionCategory,
      hasOutcomeRecord: input.hasOutcomeRecord,
    });
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

export async function recordRedaction(input: {
  caseId: string;
  caseNumber: string;
  tokenId: string;
  redacted: boolean;
  reason: string;
}): Promise<ActionResult<{ redacted: boolean }>> {
  try {
    const actor = await requireAuth();
    const result = await redact(actor, input.caseId, {
      tokenId: input.tokenId,
      redacted: input.redacted,
      reason: input.reason,
    });
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

export async function requestRedactionReview(input: {
  caseId: string;
  caseNumber: string;
}): Promise<ActionResult<{ review: string }>> {
  try {
    const actor = await requireAuth();
    const result = await requestReview(actor, input.caseId);
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

export async function completeRedactionReview(input: {
  caseId: string;
  caseNumber: string;
  reason: string;
}): Promise<ActionResult<{ review: string }>> {
  try {
    const actor = await requireAuth();
    const result = await completeReview(actor, input.caseId, { reason: input.reason });
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

/** Mint the presigned PUT URL the client uploads the _redacted_v2 file to (R2 contract). */
export async function issueRedactedExportUpload(input: {
  contentType: string;
}): Promise<ActionResult<{ uploadUrl: string; objectKey: string; sseHeaders: Record<string, string> }>> {
  try {
    const actor = await requireAuth();
    const issued = await issueUploadUrl({
      actor,
      reason: "Final redacted export upload",
      requestId: randomUUID(),
      permissions: workspacePermissionSource,
      purpose: "redacted_export",
      contentType: input.contentType,
    });
    // The SSE algorithm is part of the presigned signature; return the exact headers the
    // client must echo so the PUT succeeds under either AES256 or KMS configuration.
    const sse = serverSideEncryption();
    let sseHeaders: Record<string, string>;
    if (sse.ServerSideEncryption === "aws:kms") {
      sseHeaders = { "x-amz-server-side-encryption": "aws:kms", "x-amz-server-side-encryption-aws-kms-key-id": sse.SSEKMSKeyId };
    } else {
      sseHeaders = { "x-amz-server-side-encryption": "AES256" };
    }
    return { ok: true, data: { uploadUrl: issued.url, objectKey: issued.objectKey, sseHeaders } };
  } catch (error) {
    return failure(error);
  }
}

/** Record the uploaded redacted export as a version-2 case_files row + finalExportDone. */
export async function recordRedactedExportAction(input: {
  caseId: string;
  caseNumber: string;
  objectKey: string;
  sha256: string;
  name: string;
  type: string;
  sizeBytes: number;
}): Promise<ActionResult<{ finalExportDone: boolean; fileId: string }>> {
  try {
    const actor = await requireAuth();
    const result = await recordExport(actor, input.caseId, {
      name: input.name,
      type: input.type,
      sizeBytes: input.sizeBytes,
      storageKey: input.objectKey,
      sha256: input.sha256,
    });
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

/** "Open original · logged": reason-required, per-viewer audited; returns a signed URL to the bytes. */
export async function openOriginalFileAction(input: {
  caseId: string;
  caseNumber: string;
  fileId: string;
  reason: string;
}): Promise<ActionResult<{ url: string }>> {
  try {
    const actor = await requireAuth();
    const result = await openOriginal(actor, input.caseId, input.fileId, input.reason);
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

export async function generateEvidencePack(input: {
  caseId: string;
  caseNumber: string;
}): Promise<ActionResult<{ version: number; draft: boolean }>> {
  try {
    const actor = await requireAuth();
    const result = await generatePack(actor, input.caseId);
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}
