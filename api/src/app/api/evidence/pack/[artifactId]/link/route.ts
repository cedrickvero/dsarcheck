/**
 * POST /api/evidence/pack/[artifactId]/link - issue a 24h, single-use signed link to one
 * artifact (evidence-pack version, or a redacted-export file via artifactType). RBAC
 * (`export_evidence_packs`) + audit happen inside the issuance transaction; the raw token is
 * returned ONCE and stored only as a hash.
 */
import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { requireAuthFromRequest } from "@/server/auth/require-auth";
import { ValidationError } from "@/server/http/errors";
import { issueSignedLink, type SignedLinkArtifactType } from "@/server/cases/signed-links";

export const POST = route(async (req, ctx) => {
  const actor = await requireAuthFromRequest(req);
  const artifactId = String((await ctx.params).artifactId);

  const body = (await req.json().catch(() => ({}))) as {
    artifactType?: unknown;
    recipientType?: unknown;
    reason?: unknown;
  };
  const artifactType: SignedLinkArtifactType =
    body.artifactType === undefined || body.artifactType === "evidence_pack"
      ? "evidence_pack"
      : body.artifactType === "redacted_export"
        ? "redacted_export"
        : (() => {
            throw new ValidationError("artifactType must be evidence_pack or redacted_export");
          })();
  if (typeof body.recipientType !== "string" || body.recipientType.trim() === "") {
    throw new ValidationError("a recipient type is required");
  }
  if (typeof body.reason !== "string" || body.reason.trim().length < 3) {
    throw new ValidationError("a reason of at least 3 characters is required");
  }

  const { token, expiresAt } = await issueSignedLink(actor, {
    artifactType,
    artifactId,
    recipientType: body.recipientType,
    reason: body.reason,
  });

  // Build the absolute link from the requester's host (same rule as the magic link).
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const origin = `${forwardedProto === "https" ? "https" : "http"}://${host}`;
  const url = `${origin}/api/evidence/access?token=${token}`;

  return NextResponse.json({ token, url, expiresAt: expiresAt.toISOString() });
});
