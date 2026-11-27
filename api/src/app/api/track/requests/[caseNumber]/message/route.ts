/**
 * POST /api/track/requests/[caseNumber]/message — a signed-in requester sends a message.
 * The case is resolved by number AND the session's email under the session's workspace, so
 * a requester can never write to someone else's case. Generic redirect on failure.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { withLookup, withTenant } from "@/db/client";
import { hashToken } from "@/server/auth/crypto";
import { resolvePortalByHost } from "@/server/portal/resolve";
import { getRequesterCaseRef, requesterCookieName, resolveRequesterSession } from "@/server/portal/requester";
import { sendRequesterMessage } from "@/server/portal/replies";

function originFrom(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${forwardedProto === "https" ? "https" : "http"}://${host}`;
}

export const POST = route(async (req, ctx) => {
  const portal = await resolvePortalByHost(req.headers.get("host"));
  if (!portal) return new NextResponse("Not found", { status: 404 });

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
  try {
    await sendRequesterMessage(portal, ref.id, ref.requesterName, String(form.get("body") ?? ""));
  } catch {
    // Generic: do not disclose why the message was refused.
    return NextResponse.redirect(new URL(`/track/requests/${caseNumber}?error=1`, origin), 303);
  }

  return NextResponse.redirect(new URL(`/track/requests/${caseNumber}?msg=1`, origin), 303);
});
