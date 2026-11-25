/**
 * Per-request host routing and nonce-based CSP.
 *
 * HOST ROUTING: four surfaces, four origins (see `domain/platform.ts`):
 *   dsarcheck.com            landing only - no tenant, no authenticated content
 *   admin.dsarcheck.com      staff console - staff cookie, staff role
 *   <slug>.dsarcheck.com     one customer portal - workspace cookie, tenant from Host
 *   <customer domain>        a verified custom domain, same rules as a portal
 *
 * Two jobs here that cannot be done anywhere else:
 *   1. A cookie issued for one surface must never authenticate on another. Cookies are
 *      host-scoped, so this is belt-and-braces - but a `Domain=.dsarcheck.com` cookie set
 *      by mistake would arrive everywhere, and refusing it outright means such a mistake
 *      fails closed instead of silently granting a shared session.
 *   2. `dsarcheck.com/<slug>` is a 301 to the subdomain. The apex must not serve tenant
 *      content: path-based tenants share one origin, and therefore share cookies, cache
 *      and CSP.
 *
 * THE TENANT IS NOT DECIDED HERE. This runs on the edge with no database, so a
 * well-formed subdomain is classified as a portal and the server then resolves the
 * workspace from the Host header + session. Nothing in this file is an authorization
 * control.
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
import {
  canonicalRedirect,
  classifyHost,
  cookieAllowedOnSurface,
  presentedCookieScopes,
} from "@/domain/host";
import { contentSecurityPolicy, securityHeaders } from "@/server/http/security-headers";

export function middleware(req: NextRequest) {
  const production = process.env.NODE_ENV === "production";

  // The non-CSP headers are applied to every response this middleware returns, including
  // redirects and errors that never reach a route.
  const applyHeaders = (res: NextResponse): NextResponse => {
    for (const { key, value } of securityHeaders({ production, includeCsp: false })) {
      res.headers.set(key, value);
    }
    return res;
  };

  // ── Surface classification ─────────────────────────────────────────────────
  const surface = classifyHost(req.headers.get("host"), {
    platformDomain: process.env.PLATFORM_DOMAIN,
  });

  // ── www -> apex, unconditionally ──────────────────────────────────────────
  // Before the cookie check: a stray cookie on www must not turn a permanent redirect into
  // a 401. www serves nothing, so there is no state to protect here.
  if (surface.kind === "www") {
    const redirect = canonicalRedirect({
      host: req.headers.get("host"),
      pathname: req.nextUrl.pathname,
      search: req.nextUrl.search,
      ctx: { platformDomain: process.env.PLATFORM_DOMAIN },
    });
    if (redirect) {
      return applyHeaders(NextResponse.redirect(redirect.location, redirect.status));
    }
  }

  // ── Wrong-surface cookies ─────────────────────────────────────────────────
  // Presence only; validation is requireAuth()'s job. A staff cookie on a tenant host
  // (or the reverse) is refused rather than interpreted.
  for (const scope of presentedCookieScopes(req.headers.get("cookie"))) {
    if (!cookieAllowedOnSurface(scope, surface.kind)) {
      return applyHeaders(new NextResponse("Wrong surface", { status: 401 }));
    }
  }

  // ── Apex path -> subdomain ────────────────────────────────────────────────
  const redirect = canonicalRedirect({
    host: req.headers.get("host"),
    pathname: req.nextUrl.pathname,
    search: req.nextUrl.search,
    ctx: { platformDomain: process.env.PLATFORM_DOMAIN },
  });
  if (redirect) {
    return applyHeaders(NextResponse.redirect(redirect.location, redirect.status));
  }

  // ── Unauthenticated pre-filter (NOT a control) ────────────────────────────
  // An unauthenticated request for the workspace app gets a real 401 here instead of a
  // rendered page. It only checks whether a session cookie is PRESENT - the edge runtime
  // cannot reach Postgres to validate one - so it can be bypassed by sending any cookie.
  // The authorization control is requireAuth() in the server-rendered layout, which
  // validates the session, the expiry, the revocation and the MFA state. This exists for
  // a correct status code, not for safety.
  const { pathname } = req.nextUrl;
  if (pathname === "/app" || pathname.startsWith("/app/") || pathname.startsWith("/forbidden")) {
    const cookie = req.headers.get("cookie") ?? "";
    if (!/(?:^|;\s*)(?:__Host-)?dsar_session=/.test(cookie)) {
      return applyHeaders(new NextResponse("Unauthenticated", { status: 401 }));
    }
  }

  // ── CSP ───────────────────────────────────────────────────────────────────
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));

  const requestHeaders = new Headers(req.headers);
  // Next reads the nonce from the CSP on the REQUEST and applies it to its inline scripts.
  // In development we must also allow 'unsafe-eval': Next's dev runtime (webpack HMR +
  // React Refresh) evaluates strings, and the eval-free policy would stop every page from
  // hydrating. Production keeps the strict, eval-free policy.
  const csp = contentSecurityPolicy({ nonce, allowUnsafeEval: !production });
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  res.headers.set("Content-Security-Policy", csp);
  applyHeaders(res);
  res.headers.set("x-request-nonce-present", "1");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
