/**
 * GET /api/evidence/access?token=... - the signed-link download endpoint.
 *
 * Unauthenticated and token-gated: holding the token IS the credential. Every failure
 * (unknown, malformed, expired, revoked, replayed) returns the SAME generic 404 so the
 * endpoint cannot be used to probe whether a link ever existed. The specific outcome is
 * audited by consumeSignedLink, and a successful download streams the artifact bytes
 * (evidence-pack PDF re-rendered deterministically, or the redacted-export object read from
 * storage) with attachment disposition and no caching. In both cases the content hash the
 * token was bound to is re-verified before any byte leaves the server.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { route } from "@/server/http/handler";
import { consumeSignedLink, type ConsumeResult } from "@/server/cases/signed-links";
import { renderEvidencePackPdf } from "@/server/cases/evidence-pdf";
import { evidencePacks, caseFiles } from "@/db/schema";
import { withTenant } from "@/db/client";
import { getObjectCommand, s3 } from "@/server/storage/s3Client";
import type { EvidencePackData } from "@/domain/evidence";

const NOT_FOUND = () => new NextResponse("Not found", { status: 404 });

interface ArtifactBytes {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
  filename: string;
}

type OkResult = Extract<ConsumeResult, { status: "ok" }>;

export const GET = route(async (req) => {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NOT_FOUND();

  const result = await consumeSignedLink(token);
  if (result.status !== "ok") return NOT_FOUND();

  const artifact = result.artifactType === "redacted_export" ? await fetchRedactedExport(result) : await fetchEvidencePack(result);
  if (!artifact) return NOT_FOUND();

  return new NextResponse(artifact.bytes, {
    headers: {
      "Content-Type": artifact.contentType,
      "Content-Disposition": `attachment; filename="${sanitiseFilename(artifact.filename)}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      "Content-Length": String(artifact.bytes.length),
    },
  });
});

/** Re-render the deterministic PDF from the immutable snapshot and verify the bound hash. */
async function fetchEvidencePack(result: OkResult): Promise<ArtifactBytes | null> {
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

/** Read the redacted-export object from storage and verify its bound sha256. */
async function fetchRedactedExport(result: OkResult): Promise<ArtifactBytes | null> {
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

  let object;
  try {
    object = await s3.send(getObjectCommand(file.storageKey));
  } catch {
    // Missing or denied object fails closed — same generic 404, no disclosure.
    return null;
  }
  const raw = await object.Body!.transformToByteArray();
  // Copy into an ArrayBuffer-backed view so it satisfies Next's BodyInit type.
  const bytes = new Uint8Array(raw.length);
  bytes.set(raw);
  if (createHash("sha256").update(bytes).digest("hex") !== result.contentHash) return null;

  return { bytes, contentType: file.type || "application/octet-stream", filename: file.name || "redacted-export" };
}

/** Strip header-breaking characters from a stored filename before it reaches a header. */
function sanitiseFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned || "download";
}
