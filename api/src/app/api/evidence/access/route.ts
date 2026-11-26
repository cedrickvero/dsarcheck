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
import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { consumeSignedLink } from "@/server/cases/signed-links";
import { fetchEvidencePack, fetchRedactedExport } from "@/server/cases/evidence-download";

const NOT_FOUND = () => new NextResponse("Not found", { status: 404 });

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

/** Strip header-breaking characters from a stored filename before it reaches a header. */
function sanitiseFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned || "download";
}
