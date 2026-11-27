/**
 * Public-intake attachments (docs/08 G14).
 *
 * The intake form's "Choose files" control was inert in the prototype. This module
 * validates a submission's attachments (max 5, <= 10 MB each, PDF/JPG/PNG) and stores
 * the accepted ones straight into object storage — server-side, no signed URL — because
 * the files arrive in the multipart POST body of a no-JavaScript form, not from a client
 * that could hold a presigned PUT. The storage write is injectable so the test suite can
 * run without reaching the real S3 host.
 */
import { createHash, randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/env";
import { s3, serverSideEncryption } from "@/server/storage/s3Client";

export const ATTACHMENT_MAX_COUNT = 5;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

const ATTACHMENT_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ATTACHMENT_EXT = /\.(pdf|jpe?g|png)$/i;

export interface IntakeFile {
  name: string;
  type: string;
  size: number;
  bytes: Uint8Array;
}

/** A file is acceptable by MIME type or, when the browser omits it, by extension. */
export function attachmentTypeAllowed(name: string, mime: string): boolean {
  if (mime !== "" && ATTACHMENT_MIME.has(mime.toLowerCase())) return true;
  return ATTACHMENT_EXT.test(name);
}

/** Returns the first validation error, or null when every file passes. */
export function validateAttachments(
  files: { name: string; type: string; size: number }[],
): string | null {
  if (files.length > ATTACHMENT_MAX_COUNT) return `Attach up to ${ATTACHMENT_MAX_COUNT} files.`;
  for (const f of files) {
    if (f.size > ATTACHMENT_MAX_BYTES) return `${f.name} is larger than 10 MB.`;
    if (!attachmentTypeAllowed(f.name, f.type)) return `${f.name} is not a PDF, JPG or PNG.`;
  }
  return null;
}

export interface StoredAttachment {
  name: string;
  type: string;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
}

/** Tenant-scoped by construction: the workspace id is the first segment. */
export function intakeStorageKey(workspaceId: string, caseId: string, id: string): string {
  return `intake/${workspaceId}/${caseId}/${id}`;
}

/** Ceiling for the whole multipart body: 5 files plus ~1 MB of form fields. */
export const MAX_INTAKE_BODY_BYTES = ATTACHMENT_MAX_COUNT * ATTACHMENT_MAX_BYTES + 1024 * 1024;

/** Reject an oversized body before buffering it (Content-Length guard; chunked bodies are unbounded). */
export function intakeBodyTooLarge(contentLengthHeader: string | null): boolean {
  if (!contentLengthHeader) return false;
  const n = Number(contentLengthHeader);
  return Number.isFinite(n) && n > MAX_INTAKE_BODY_BYTES;
}

export type PutObject = (key: string, contentType: string, body: Uint8Array) => Promise<void>;

/** The real storage write: direct PUT with server-side encryption, no signed URL. */
export async function putObjectToS3(key: string, contentType: string, body: Uint8Array): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
      ...serverSideEncryption(),
    }),
  );
}

/**
 * Store every accepted file and return its metadata. The caller records the case_files
 * rows in its own transaction after this resolves; the bytes and their hash are computed
 * here so the DB row references a real object.
 */
export async function storeIntakeAttachments(
  workspaceId: string,
  caseId: string,
  files: IntakeFile[],
  putObject: PutObject = putObjectToS3,
): Promise<StoredAttachment[]> {
  const out: StoredAttachment[] = [];
  for (const f of files) {
    const storageKey = intakeStorageKey(workspaceId, caseId, randomUUID());
    const sha256 = createHash("sha256").update(f.bytes).digest("hex");
    await putObject(storageKey, f.type, f.bytes);
    out.push({ name: f.name, type: f.type, sizeBytes: f.size, storageKey, sha256 });
  }
  return out;
}
