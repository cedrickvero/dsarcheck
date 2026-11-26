/**
 * GET /api/evidence/pack/[artifactId]/pdf - authenticated staff download of one
 * evidence-pack version. RBAC (`export_evidence_packs`) + workspace RLS + audit in one
 * transaction, then the deterministic PDF is streamed with attachment disposition.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { route } from "@/server/http/handler";
import { requireAuthFromRequest } from "@/server/auth/require-auth";
import { can } from "@/server/authz";
import { ForbiddenError, ValidationError } from "@/server/http/errors";
import { renderEvidencePackPdf } from "@/server/cases/evidence-pdf";
import { evidencePacks } from "@/db/schema";
import { withTenant } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";
import type { EvidencePackData } from "@/domain/evidence";

export const GET = route(async (req, ctx) => {
  const actor = await requireAuthFromRequest(req);
  if (!actor.roles.some((r) => can(r, "export_evidence_packs"))) {
    throw new ForbiddenError("Your role does not permit downloading evidence packs.");
  }
  const { artifactId } = await ctx.params;
  const artifactIdStr = String(artifactId);

  const bytes = await withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const [pack] = await tx
        .select({ content: evidencePacks.content })
        .from(evidencePacks)
        .where(and(eq(evidencePacks.id, artifactIdStr), eq(evidencePacks.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!pack) throw new ValidationError("unknown evidence pack");

      const pdf = renderEvidencePackPdf(pack.content as EvidencePackData);
      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: "Evidence pack downloaded",
        category: "Evidence",
        reason: "Downloaded evidence pack",
        objectType: "evidence_pack",
        objectId: artifactIdStr,
        meta: { artifactId: artifactIdStr },
      });
      return pdf;
    },
  );

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
