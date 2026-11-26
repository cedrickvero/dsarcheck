/**
 * Authenticated file-bytes resolution for the in-app preview. Split out of the route file so
 * the logic is unit-testable with the object reader injectable (the direct S3 read cannot run
 * against the dev MinIO host, whose underscore hostname it rejects — same as evidence-download).
 *
 * RBAC + RLS happen here: the file must belong to the actor's workspace AND the given case.
 * No audit is written for loading the blurred preview (the content is unreadable); "Open
 * original" is a separate reason-required action that is audited per viewer.
 */
import { and, eq } from "drizzle-orm";
import { caseFiles, cases } from "@/db/schema";
import { withTenant } from "@/db/client";
import { can } from "@/server/authz";
import { ForbiddenError, ValidationError } from "@/server/http/errors";
import { getObjectCommand, s3 } from "@/server/storage/s3Client";
import type { Actor } from "@/server/auth/require-auth";

export interface CaseFileBytes {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
  filename: string;
  isRedactedExport: boolean;
}

export type ReadObject = (key: string) => Promise<Uint8Array | null>;

export async function loadCaseFileBytes(
  actor: Actor,
  caseId: string,
  fileId: string,
  readObject: ReadObject = defaultReadObject,
): Promise<CaseFileBytes | null> {
  if (!actor.roles.some((r) => can(r, "export_evidence_packs"))) {
    throw new ForbiddenError("Your role does not permit viewing case files.");
  }

  const file = await withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [row] = await tx
        .select({
          storageKey: caseFiles.storageKey,
          name: caseFiles.name,
          type: caseFiles.type,
          isRedactedExport: caseFiles.isRedactedExport,
          caseId: caseFiles.caseId,
        })
        .from(caseFiles)
        .where(and(eq(caseFiles.id, fileId), eq(caseFiles.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!row) return null;
      // The file must belong to the requested case (the route path is untrusted input).
      const [c] = await tx.select({ id: cases.id }).from(cases).where(and(eq(cases.id, caseId), eq(cases.workspaceId, actor.workspaceId))).limit(1);
      if (!c || row.caseId !== c.id) return null;
      return row;
    },
  );
  if (!file || !file.storageKey) return null;

  // Originals are NOT served here: the blurred preview must never pull the unredacted bytes.
  // They reach the browser only after "Open original" writes the reason + audit and mints a
  // short-lived signed URL. This endpoint serves the already-redacted export only.
  if (!file.isRedactedExport) return null;

  const raw = await readObject(file.storageKey);
  if (!raw) return null;
  const bytes = new Uint8Array(raw.length);
  bytes.set(raw);

  // Defence-in-depth: a non-image/non-PDF stored type is forced to octet-stream so a file
  // recorded as text/html cannot execute script in the app origin on direct navigation.
  const contentType = /^(image\/|application\/pdf$)/.test(file.type) ? file.type : "application/octet-stream";

  return {
    bytes,
    contentType,
    filename: file.name,
    isRedactedExport: file.isRedactedExport,
  };
}

async function defaultReadObject(key: string): Promise<Uint8Array | null> {
  try {
    const object = await s3.send(getObjectCommand(key));
    return await object.Body!.transformToByteArray();
  } catch {
    return null;
  }
}
