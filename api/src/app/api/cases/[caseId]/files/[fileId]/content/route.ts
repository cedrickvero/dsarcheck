/**
 * GET /api/cases/[caseId]/files/[fileId]/content - authenticated, workspace-scoped file bytes
 * for the in-app preview. The session cookie authorizes it (same-origin); RBAC + RLS happen in
 * loadCaseFileBytes. Served inline (not attachment) with nosniff and no-store so a preview
 * cannot become a de facto download; "Open original" is a separate reason-required, audited
 * action the client performs before un-blurring.
 */
import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { requireAuthFromRequest } from "@/server/auth/require-auth";
import { loadCaseFileBytes } from "@/server/cases/file-content";

const NOT_FOUND = () => new NextResponse("Not found", { status: 404 });

export const GET = route(async (req, ctx) => {
  const actor = await requireAuthFromRequest(req);
  const caseId = String((await ctx.params).caseId);
  const fileId = String((await ctx.params).fileId);

  const file = await loadCaseFileBytes(actor, caseId, fileId);
  if (!file) return NOT_FOUND();

  return new NextResponse(file.bytes, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${sanitiseFilename(file.filename)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(file.bytes.length),
    },
  });
});

function sanitiseFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned || "file";
}
