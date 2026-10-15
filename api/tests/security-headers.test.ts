import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/server/http/security-headers";
import { sessionCookiePolicy } from "@/server/http/cookies";

describe("Content-Security-Policy", () => {
  const csp = contentSecurityPolicy();

  it("locks the document down by default", () => {
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("never allows inline or eval'd script", () => {
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("script-src 'self'");
  });
});

describe("security header set", () => {
  it("sends the baseline headers in development", () => {
    const keys = securityHeaders({ production: false }).map((h) => h.key);
    expect(keys).toContain("Content-Security-Policy");
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("Permissions-Policy");
  });

  it("omits HSTS in development so localhost is not pinned to https", () => {
    const keys = securityHeaders({ production: false }).map((h) => h.key);
    expect(keys).not.toContain("Strict-Transport-Security");
  });

  it("sends HSTS in production, without preload", () => {
    const hsts = securityHeaders({ production: true }).find(
      (h) => h.key === "Strict-Transport-Security",
    );
    expect(hsts, "HSTS missing in production").toBeTruthy();
    expect(hsts!.value).toMatch(/max-age=\d{6,}/);
    expect(hsts!.value).toContain("includeSubDomains");
    // preload is irreversible; it waits for the production domain list
    expect(hsts!.value).not.toContain("preload");
  });

  it("uses nosniff and DENY framing", () => {
    const headers = securityHeaders({ production: true });
    expect(headers.find((h) => h.key === "X-Content-Type-Options")!.value).toBe("nosniff");
    expect(headers.find((h) => h.key === "X-Frame-Options")!.value).toBe("DENY");
  });
});

describe("session cookie policy", () => {
  it("is always HttpOnly, SameSite=Lax and path-scoped", () => {
    for (const production of [false, true]) {
      const { options } = sessionCookiePolicy({ production });
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe("lax");
      expect(options.path).toBe("/");
    }
  });

  it("requires Secure and the __Host- prefix in production", () => {
    const { name, options } = sessionCookiePolicy({ production: true });
    expect(options.secure).toBe(true);
    expect(name.startsWith("__Host-"), "__Host- requires Secure, no Domain, Path=/").toBe(true);
  });
});
