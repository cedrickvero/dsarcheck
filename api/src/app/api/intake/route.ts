/**
 * POST /api/intake — the public intake form's no-JavaScript submission path.
 *
 * Resolves the workspace from the Host (never the body), validates, records the case, and
 * 303s to the confirmation page (Post/Redirect/Get so a refresh does not resubmit). An
 * unknown host or a validation failure never reveals which workspace exists: unknown host is
 * a bare 404, and a validation failure 303s back to the form with a generic flag.
 */
import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { resolvePortalByHost } from "@/server/portal/resolve";
import { submitIntake } from "@/server/portal/intake";

export const POST = route(async (req) => {
  const portal = await resolvePortalByHost(req.headers.get("host"));
  if (!portal) return new NextResponse("Not found", { status: 404 });

  const form = await req.formData();
  const input = {
    type: String(form.get("type") ?? ""),
    name: String(form.get("name") ?? ""),
    email: String(form.get("email") ?? ""),
    identKind: String(form.get("identKind") ?? "Customer ID"),
    ident: String(form.get("ident") ?? ""),
    details: String(form.get("details") ?? ""),
    consent: String(form.get("consent") ?? ""),
  };

  let caseNumber: string;
  try {
    ({ caseNumber } = await submitIntake(portal, input));
  } catch {
    // Generic: do not disclose which field failed over the wire.
    return NextResponse.redirect(new URL("/?error=1", req.url), 303);
  }

  return NextResponse.redirect(new URL(`/received/${encodeURIComponent(caseNumber)}`, req.url), 303);
});
