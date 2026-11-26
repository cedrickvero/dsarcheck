/**
 * POST /api/intake — the public intake form's no-JavaScript submission path.
 *
 * Resolves the workspace from the Host (never the body), validates, records the case (and
 * mints its email-confirmation link), sends the confirmation email, and 303s to the
 * confirmation page (Post/Redirect/Get so a refresh does not resubmit). An unknown host or
 * a validation failure never reveals which workspace exists: unknown host is a bare 404,
 * and a validation failure 303s back to the form with a generic flag.
 */
import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { resolvePortalByHost } from "@/server/portal/resolve";
import { submitIntake } from "@/server/portal/intake";

function originFrom(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${forwardedProto === "https" ? "https" : "http"}://${host}`;
}

export const POST = route(async (req) => {
  const portal = await resolvePortalByHost(req.headers.get("host"));
  if (!portal) return new NextResponse("Not found", { status: 404 });

  const origin = originFrom(req);
  const form = await req.formData();
  const input = {
    type: String(form.get("type") ?? ""),
    name: String(form.get("name") ?? ""),
    email: String(form.get("email") ?? ""),
    identKind: String(form.get("identKind") ?? "Customer ID"),
    ident: String(form.get("ident") ?? ""),
    details: String(form.get("details") ?? ""),
    consent: String(form.get("consent") ?? ""),
    human: String(form.get("human") ?? ""),
  };

  let result: { caseNumber: string; email: string; confirmUrl: string };
  try {
    result = await submitIntake(portal, input, origin);
  } catch {
    // Generic: do not disclose which field failed over the wire.
    return NextResponse.redirect(new URL("/?error=1", origin), 303);
  }

  // Confirmation email (G3): receipt + the "confirm your email" link (G2). Delivery is
  // best-effort — a mailer outage must not fail a successfully recorded case.
  const { sendConfirmationEmail } = await import("@/server/auth/mailer");
  await sendConfirmationEmail(result.email, result.caseNumber, result.confirmUrl).catch(() => undefined);

  return NextResponse.redirect(new URL(`/received/${encodeURIComponent(result.caseNumber)}`, origin), 303);
});
