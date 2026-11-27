/**
 * POST /api/track/requests/[caseNumber]/info — a signed-in requester answers the handler's
 * "Request more information" with an upload and/or a note. The file is stored as a
 * `requester_upload` case file and clears `infoRequested`. The case is resolved by number
 * AND the session's email under the session's workspace, so a requester can never write to
 * someone else's case. Generic redirect on failure.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { withLookup, withTenant } from "@/db/client";
import { hashToken } from "@/server/auth/crypto";
import { resolvePortalByHost } from "@/server/portal/resolve";
import { getRequesterCaseRef, requesterCookieName, resolveRequesterSession } from "@/server/portal/requester";
import { submitRequesterInfo } from "@/server/portal/replies";
import { intakeBodyTooLarge, type IntakeFile } from "@/server/portal/attachments";

function originFrom(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${forwardedProto === "https" ? "https" : "http"}://${host}`;
}

export const POST = route(async (req, ctx) => {
  const portal = await resolvePortalByHost(req.headers.get("host"));
  if (!portal) return new NextResponse("Not found", { status: 404 });

  // Same DoS guard as the intake route: reject an oversized body before buffering it.
  if (intakeBodyTooLarge(req.headers.get("content-length"))) {
    return new NextResponse("Payload too large", { status: 413 });
  }

  const origin = originFrom(req);
  const raw = (await ctx.params).caseNumber;
  const caseNumber = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const number = decodeURIComponent(caseNumber);

  const token = (await cookies()).get(requesterCookieName())?.value;
  if (!token) return NextResponse.redirect(new URL("/track", origin), 303);

  const session = await withLookup({ requesterSessionTokenHash: hashToken(token) }, (tx) =>
    resolveRequesterSession(tx, token),
  );
  if (!session || session.workspaceId !== portal.workspaceId) {
    return NextResponse.redirect(new URL("/track", origin), 303);
  }

  const ref = await withTenant(
    { orgId: session.orgId, workspaceId: session.workspaceId, actorId: "requester" },
    (tx) => getRequesterCaseRef(tx, number, session.email),
  );
  if (!ref) return new NextResponse("Not found", { status: 404 });

  const form = await req.formData();
  const note = String(form.get("note") ?? "");
  const rawFiles = form.getAll("file").filter((v): v is File => v instanceof File);
  let file: IntakeFile | null = null;
  if (rawFiles.length > 0) {
    const f = rawFiles[0]!;
    file = { name: f.name, type: f.type, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()) };
  }

  try {
    await submitRequesterInfo(portal, ref.id, ref.requesterName, { file, note });
  } catch {
    return NextResponse.redirect(new URL(`/track/requests/${caseNumber}?error=1`, origin), 303);
  }

  return NextResponse.redirect(new URL(`/track/requests/${caseNumber}?sent=1`, origin), 303);
});
