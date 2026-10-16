/**
 * The nonce-based CSP.
 *
 * These assert the properties the owner required: a nonce is present, unique per request,
 * never logged, and no policy anywhere uses unsafe-inline or unsafe-eval. The header set
 * is also checked for the "routes cannot opt out" property - it is applied by middleware
 * over the whole matcher, not per route.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { middleware, config } from "@/middleware";
import { contentSecurityPolicy, securityHeaders } from "@/server/http/security-headers";

describe("T-07 nonce CSP", () => {
  it("includes a nonce for scripts, and no unsafe-inline or unsafe-eval anywhere", () => {
    const csp = contentSecurityPolicy({ nonce: "TESTNONCE123" });
    expect(csp).toContain("'nonce-TESTNONCE123'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("style-src 'self'");
  });

  it("is UNIQUE per request - a fresh nonce every time", () => {
    const mk = () =>
      middleware({
        nextUrl: { pathname: "/app/cases", href: "http://localhost/app/cases" },
        headers: new Headers({ cookie: "dsar_session=x" }),
      } as unknown as Parameters<typeof middleware>[0]);
    const seen = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const csp = mk().headers.get("Content-Security-Policy") ?? "";
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
      expect(nonce, "no nonce in the CSP").toBeTruthy();
      seen.add(nonce!);
    }
    expect(seen.size).toBe(25);
  });

  it("never logs the nonce", () => {
    const src = readFileSync("src/middleware.ts", "utf8");
    expect(src).not.toMatch(/console\.(log|info|warn|error)/);
  });

  it("carries the nonce on the REQUEST, where Next reads it, and never in a response body", () => {
    const src = readFileSync("src/middleware.ts", "utf8");
    expect(src).toMatch(/requestHeaders\.set\("Content-Security-Policy"/);
    expect(src).not.toMatch(/nonce=.*cookies|nonce.*localStorage/);
  });

  it("cannot be opted out of by an individual route - the matcher covers everything but static assets", () => {
    expect(config.matcher).toHaveLength(1);
    const pattern = config.matcher[0]!;
    expect(pattern).toContain("(?!_next/static");
    // The exclusion list is static assets only: any route not matching it gets the CSP.
    expect(pattern).not.toMatch(/api|admin|app\b/);
  });

  it("the static (non-nonce) policy stays strict - no nonce, but still no unsafe-*", () => {
    const shared = contentSecurityPolicy();
    expect(shared).not.toContain("unsafe-inline");
    expect(shared).not.toContain("unsafe-eval");
    expect(shared).toContain("script-src 'self'");
    // and the shared header definition carries the same prohibitions
    for (const { value } of securityHeaders({ production: true })) {
      expect(value).not.toContain("unsafe-inline");
      expect(value).not.toContain("unsafe-eval");
    }
  });
});
