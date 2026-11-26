/**
 * Server-side artifact resolution for the signed-link download route. Split out of the route
 * file because Next route files may only export HTTP handlers — the redacted-export integrity
 * check lives here with the object reader injectable so it is unit-testable (the direct S3
 * read cannot run against the dev MinIO host, whose underscore hostname it rejects).
 */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { caseFiles, evidencePacks } from "@/db/schema";
import { withTenant } from "@/db/client";
import { getObjectCommand, s3 } from "@/server/storage/s3Client";
import { renderEvidencePackPdf } from "./evidence-pdf";
import type { ConsumeResult } from "./signed-links";
import type { EvidencePackData } from "@/domain/evidence";

export interface ArtifactBytes {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
  filename: string;
}

export type OkResult = Extract<ConsumeResult, { status: "ok" }>;

/** Re-render the deterministic PDF from the immutable snapshot and verify the bound hash. */
export async function fetchEvidencePack(result: OkResult): Promise<ArtifactBytes | null> {
  const bytes = await withTenant(
    { orgId: result.orgId, workspaceId: result.workspaceId, actorId: "signed-link-recipient" },
    async (tx) => {
      const [pack] = await tx
        .select({ content: evidencePacks.content })
        .from(evidencePacks)
        .where(eq(evidencePacks.id, result.artifactId))
        .limit(1);
      if (!pack) return null;
      const pdf = renderEvidencePackPdf(pack.content as EvidencePackData);
      if (createHash("sha256").update(pdf).digest("hex") !== result.contentHash) return null;
      return pdf;
    },
  );
  if (!bytes) return null;
  return { bytes, contentType: "application/pdf", filename: "evidence-pack.pdf" };
}

export type ReadObject = (key: string) => Promise<Uint8Array | null>;

/** Read the redacted-export object from storage and verify its bound sha256. */
export async function fetchRedactedExport(
  result: OkResult,
  readObject: ReadObject = defaultReadObject,
): Promise<ArtifactBytes | null> {
  const file = await withTenant(
    { orgId: result.orgId, workspaceId: result.workspaceId, actorId: "signed-link-recipient" },
    async (tx) => {
      const [row] = await tx
        .select({ storageKey: caseFiles.storageKey, name: caseFiles.name, type: caseFiles.type })
        .from(caseFiles)
        .where(and(eq(caseFiles.id, result.artifactId), eq(caseFiles.workspaceId, result.workspaceId), eq(caseFiles.isRedactedExport, true)))
        .limit(1);
      return row ?? null;
    },
  );
  if (!file || !file.storageKey) return null;

  const raw = await readObject(file.storageKey);
  if (!raw) return null;
  // Copy into an ArrayBuffer-backed view so it satisfies Next's BodyInit type.
  const bytes = new Uint8Array(raw.length);
  bytes.set(raw);
  if (createHash("sha256").update(bytes).digest("hex") !== result.contentHash) return null;

  return { bytes, contentType: file.type || "application/octet-stream", filename: file.name || "redacted-export" };
}

/** The production reader: fetch + stream the object from S3, failing closed to null. */
async function defaultReadObject(key: string): Promise<Uint8Array | null> {
  try {
    const object = await s3.send(getObjectCommand(key));
    return await object.Body!.transformToByteArray();
  } catch {
    // Missing, denied or mid-stream read error fails closed — same generic 404, no disclosure.
    return null;
  }
}
