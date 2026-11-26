/**
 * GET /api/evidence/access?token=... - the signed-link download endpoint.
 *
 * Unauthenticated and token-gated: holding the token IS the credential. Every failure
 * (unknown, malformed, expired, revoked, replayed) returns the SAME generic 404 so the
 * endpoint cannot be used to probe whether a link ever existed. The specific outcome is
 * audited by consumeSignedLink, and a successful download streams the deterministic PDF
 * with attachment disposition and no caching.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { route } from "@/server/http/handler";
import { consumeSignedLink } from "@/server/cases/signed-links";
import { renderEvidencePackPdf } from "@/server/cases/evidence-pdf";
import { evidencePacks } from "@/db/schema";
import { withTenant } from "@/db/client";
import type { EvidencePackData } from "@/domain/evidence";

const NOT_FOUND = () => new NextResponse("Not found", { status: 404 });

export const GET = route(async (req) => {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NOT_FOUND();

  const result = await consumeSignedLink(token);
  if (result.status !== "ok") return NOT_FOUND();

  // Re-render the deterministic PDF from the immutable snapshot and verify the content
  // hash the token was bound to. The link is already consumed (single-use); a mismatch is a
  // defensive integrity failure, so it fails closed with the same generic 404 — the caller
  // must not learn whether the token or the artifact was the problem.
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
  if (!bytes) return NOT_FOUND();

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="evidence-pack.pdf"',
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      "Content-Length": String(bytes.length),
    },
  });
});
