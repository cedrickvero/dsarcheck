import { describe, expect, it } from "vitest";
import {
  canonicalRedirect,
  classifyHost,
  cookieAllowedOnSurface,
  normalizeHost,
  presentedCookieScopes,
  type HostSurface,
} from "@/domain/host";
import {
  RESERVED_SLUGS,
  STAFF_COOKIE,
  STAFF_COOKIE_PROD,
  WORKSPACE_COOKIE_PROD,
  adminHost,
  apexHost,
  cookieName,
  cookieScopeOf,
  customDomainTarget,
  isValidSlug,
  portalHost,
} from "@/domain/platform";

const P = "dsarcheck.com";

describe("normalizeHost()", () => {
  it("lower-cases, strips a port and a trailing dot", () => {
    expect(normalizeHost("ACME.DSARCheck.com")).toBe("acme.dsarcheck.com");
    expect(normalizeHost("acme.dsarcheck.com:443")).toBe("acme.dsarcheck.com");
    expect(normalizeHost("acme.dsarcheck.com.")).toBe("acme.dsarcheck.com");
    expect(normalizeHost("  acme.dsarcheck.com  ")).toBe("acme.dsarcheck.com");
  });

  it("refuses values that cannot be a host, rather than falling back to the apex", () => {
    for (const bad of [null, undefined, "", "   ", "localhost", "[::1]", "acme..com", "a b.com", "acme.dsarcheck.com:https"]) {
      expect(normalizeHost(bad), String(bad)).toBeNull();
    }
  });
});

describe("classifyHost()", () => {
  const at = (host: string | null, ctx = {}): HostSurface => classifyHost(host, { platformDomain: P, ...ctx });

  it("classifies the apex and www as the landing surface", () => {
    expect(at(P)).toEqual({ kind: "apex", host: P });
    expect(at(`www.${P}`)).toEqual({ kind: "apex", host: `www.${P}` });
  });

  it("classifies admin as the staff console", () => {
    expect(at(adminHost(P))).toEqual({ kind: "admin", host: `admin.${P}` });
  });

  it("never treats the CNAME target as a workspace", () => {
    expect(at(customDomainTarget(P))).toMatchObject({ kind: "unknown", reason: "reserved-slug" });
  });

  it("classifies a well-formed subdomain as a portal and returns the slug", () => {
    expect(at(portalHost("acme", P))).toEqual({ kind: "portal", slug: "acme", host: `acme.${P}` });
    expect(at(portalHost("acme-health", P))).toMatchObject({ kind: "portal", slug: "acme-health" });
  });

  it("refuses nested subdomains instead of guessing which label is the tenant", () => {
    expect(at(`a.b.${P}`)).toMatchObject({ kind: "unknown", reason: "nested-subdomain" });
  });

  it("refuses every reserved name, so no tenant can shadow a surface", () => {
    // `admin.` and `www.` are surfaces in their own right, asserted above; everything
    // else in the reserved list has to come back as `unknown`.
    for (const reserved of ["api", "app", "portals", "status", "support", "dsarcheck", "dsar"]) {
      expect(at(`${reserved}.${P}`), reserved).toMatchObject({ kind: "unknown", reason: "reserved-slug" });
    }
  });

  it("refuses a slug that breaks the 3-30 character rule", () => {
    expect(at(`ab.${P}`)).toMatchObject({ kind: "unknown", reason: "malformed-host" });
    expect(at(`${"a".repeat(31)}.${P}`)).toMatchObject({ kind: "unknown", reason: "malformed-host" });
  });

  it("filters on known slugs when the caller has them, and stays silent about which", () => {
    const ctx = { knownSlugs: new Set(["acme"]) };
    expect(at(portalHost("acme", P), ctx)).toMatchObject({ kind: "portal", slug: "acme" });
    // An unknown and a reserved subdomain both produce `unknown`; neither enumerates.
    expect(at(portalHost("ghost", P), ctx)).toMatchObject({ kind: "unknown", reason: "unknown-slug" });
    expect(at(portalHost("status", P), ctx)).toMatchObject({ kind: "unknown", reason: "reserved-slug" });
  });

  it("treats a foreign host as a custom domain, and refuses it unless verified", () => {
    expect(at("privacy.acme.com")).toEqual({ kind: "custom-domain", host: "privacy.acme.com", verified: undefined });
    expect(at("privacy.acme.com", { verifiedCustomDomains: new Set(["privacy.acme.com"]) })).toMatchObject({
      kind: "custom-domain",
      verified: true,
    });
    expect(at("privacy.evil.com", { verifiedCustomDomains: new Set(["privacy.acme.com"]) })).toMatchObject({
      kind: "unknown",
      reason: "unverified-custom-domain",
    });
  });

  it("does not accept a lookalike domain that merely ends with the platform name", () => {
    expect(at("acme.dsarcheck.com.evil.test")).toMatchObject({ kind: "custom-domain", verified: undefined });
  });

  it("reports a missing or malformed Host honestly", () => {
    expect(at(null)).toMatchObject({ kind: "unknown", reason: "missing-host" });
    expect(at("not a host")).toMatchObject({ kind: "unknown", reason: "malformed-host" });
  });

  it("holds the separation invariant: no reserved name can ever resolve to a portal", () => {
    for (const reserved of RESERVED_SLUGS) {
      const surface = classifyHost(`${reserved}.${P}`, { platformDomain: P });
      expect(surface.kind, reserved).not.toBe("portal");
    }
  });
});

describe("canonicalRedirect()", () => {
  const go = (pathname: string, host = P, ctx = {}) =>
    canonicalRedirect({ host, pathname, ctx: { platformDomain: P, ...ctx } });

  it("moves a path-shaped tenant URL to its subdomain, preserving the rest", () => {
    expect(go("/acme")).toEqual({ status: 301, location: `https://acme.${P}/` });
    expect(go("/acme/app/cases")).toEqual({ status: 301, location: `https://acme.${P}/app/cases` });
    expect(go("/acme/")).toEqual({ status: 301, location: `https://acme.${P}/` });
  });

  it("preserves the query string", () => {
    expect(
      canonicalRedirect({
        host: P,
        pathname: "/acme/track",
        search: "?ref=email",
        ctx: { platformDomain: P },
      }),
    ).toEqual({ status: 301, location: `https://acme.${P}/track?ref=email` });
  });

  it("leaves real apex routes alone", () => {
    for (const path of ["/", "/app", "/api/health", "/health", "/privacy", "/pricing", "/robots.txt"]) {
      expect(go(path), path).toBeNull();
    }
  });

  it("leaves reserved names alone, so they 404 rather than redirect into a tenant", () => {
    for (const path of ["/admin", "/status", "/portal", "/dsar"]) {
      expect(go(path), path).toBeNull();
    }
  });

  it("does not redirect a slug it knows does not exist", () => {
    expect(go("/ghost", P, { knownSlugs: new Set(["acme"]) })).toBeNull();
    expect(go("/acme", P, { knownSlugs: new Set(["acme"]) })).not.toBeNull();
  });

  it("never redirects from a portal, admin or custom domain", () => {
    expect(go("/acme/app", portalHost("acme", P))).toBeNull();
    expect(go("/acme", adminHost(P))).toBeNull();
    expect(go("/acme", "privacy.acme.com")).toBeNull();
  });

  it("ignores a path whose first segment is not a valid slug", () => {
    expect(go("/ab")).toBeNull();
    expect(go("/Acme_Health")).toBeNull();
  });
});

describe("cookie surfaces", () => {
  it("allows the workspace cookie only on a tenant origin", () => {
    expect(cookieAllowedOnSurface("workspace", "portal")).toBe(true);
    expect(cookieAllowedOnSurface("workspace", "custom-domain")).toBe(true);
    expect(cookieAllowedOnSurface("workspace", "admin")).toBe(false);
    expect(cookieAllowedOnSurface("workspace", "apex")).toBe(false);
    expect(cookieAllowedOnSurface("workspace", "unknown")).toBe(false);
  });

  it("allows the staff cookie only on the admin console", () => {
    expect(cookieAllowedOnSurface("staff", "admin")).toBe(true);
    for (const surface of ["portal", "custom-domain", "apex", "unknown"] as const) {
      expect(cookieAllowedOnSurface("staff", surface), surface).toBe(false);
    }
  });

  it("uses the __Host- prefix in production, which forbids a Domain attribute", () => {
    expect(cookieName("workspace", true)).toBe(WORKSPACE_COOKIE_PROD);
    expect(cookieName("staff", true)).toBe(STAFF_COOKIE_PROD);
    expect(cookieName("workspace", true).startsWith("__Host-")).toBe(true);
    expect(cookieName("staff", true).startsWith("__Host-")).toBe(true);
    expect(cookieName("workspace", false)).toBe("dsar_session");
    expect(cookieName("staff", false)).toBe(STAFF_COOKIE);
  });

  it("maps presented cookie names back to their surface, and ignores foreign cookies", () => {
    expect(cookieScopeOf(WORKSPACE_COOKIE_PROD)).toBe("workspace");
    expect(cookieScopeOf(STAFF_COOKIE)).toBe("staff");
    expect(cookieScopeOf("_ga")).toBeNull();
    expect(cookieScopeOf("dsar_session_evil")).toBeNull();
  });

  it("reads every scope present on a request without trusting the order", () => {
    expect(presentedCookieScopes(null)).toEqual([]);
    expect(presentedCookieScopes("_ga=1; dsar_staff_session=x; theme=dark")).toEqual(["staff"]);
    expect(
      presentedCookieScopes("theme=dark; __Host-dsar_session=abc; dsar_staff_session=def").sort(),
    ).toEqual(["staff", "workspace"]);
  });
});

describe("platform constants", () => {
  it("builds the documented hosts", () => {
    expect(apexHost(P)).toBe(P);
    expect(adminHost(P)).toBe(`admin.${P}`);
    expect(portalHost("acme", P)).toBe(`acme.${P}`);
    expect(customDomainTarget(P)).toBe(`portals.${P}`);
  });

  it("reserves the infrastructure names a customer must never claim", () => {
    for (const name of ["www", "admin", "api", "app", "portals", "status", "support", "mail", "cdn", "staging", "dsarcheck"]) {
      expect(RESERVED_SLUGS, name).toContain(name);
    }
  });

  it("enforces the 3-30 character slug rule at both boundaries", () => {
    expect(isValidSlug("abc")).toBe(true);
    expect(isValidSlug("a".repeat(30))).toBe(true);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("a".repeat(31))).toBe(false);
    expect(isValidSlug("-abc")).toBe(false);
    expect(isValidSlug("abc-")).toBe(false);
    expect(isValidSlug("ABC")).toBe(false);
  });
});
