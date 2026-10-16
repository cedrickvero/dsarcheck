/**
 * Per-request nonce-based CSP.
 *
 * WHY MIDDLEWARE OWNS THE CSP: Next's App Router emits INLINE bootstrap scripts for
 * streaming and RSC payloads. A `script-src 'self'` without a nonce blocks them, so real
 * pages would not hydrate. R3 deliberately shipped a nonce-free CSP while nothing
 * rendered; T-07 is where that decision is revisited, as planned.
 *
 * The nonce is generated with the Web Crypto API (middleware runs on the edge runtime,
 * where node:crypto is unavailable), is never logged, never cached, never reused across
 * requests, and is NOT put on the response - it goes on the REQUEST headers, which is
 * how Next discovers it and stamps its own inline scripts. Putting it on the response
 * would expose it; putting it in props would leak it to the client.
 *
 * The matcher covers every route except static assets, so no route can opt out.
 */
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, securityHeaders } from "@/server/http/security-headers";

export function middleware(req: NextRequest) {
  // PRE-FILTER, NOT A CONTROL. An unauthenticated request for the workspace app gets a
  // real 401 here instead of a rendered page. It only checks whether a session cookie is
  // PRESENT - the edge runtime cannot reach Postgres to validate one - so it can be
  // bypassed by sending any cookie. The authorization control is requireAuth() in the
  // server-rendered layout, which validates the session, the expiry, the revocation and
  // the MFA state. This exists for a correct status code, not for safety.
  const { pathname } = req.nextUrl;
  if (pathname === "/app" || pathname.startsWith("/app/") || pathname.startsWith("/forbidden")) {
    const cookie = req.headers.get("cookie") ?? "";
    if (!/(?:^|;\s*)(?:__Host-)?dsar_session=/.test(cookie)) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));

  const production = process.env.NODE_ENV === "production";
  const headers = securityHeaders({ production, includeCsp: false });

  const requestHeaders = new Headers(req.headers);
  // Next reads the nonce from the CSP on the REQUEST and applies it to its inline scripts.
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy({ nonce }));

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  res.headers.set("Content-Security-Policy", contentSecurityPolicy({ nonce }));
  // The non-CSP headers are re-applied here so they hold on any response the middleware
  // sees, including redirects and errors that never reach a route.
  for (const { key, value } of headers) {
    res.headers.set(key, value);
  }
  res.headers.set("x-request-nonce-present", "1");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
