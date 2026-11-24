/**
 * Platform identity: the domains, the slug rules and the cookie names.
 *
 * One constant per fact, because the brand is currently hard-coded in customer-visible
 * copy (`{slug}.privacyspace.com` in the design handoff) and in the sign-in mail. When
 * the product domain changes, it changes here — see `docs/08-gaps-and-decisions.md`.
 *
 * Pure: no env reads, no I/O, so the edge middleware and the client can both import it.
 */

/** Apex and wildcard base. `*.dsarcheck.com` is the customer portal space. */
export const DEFAULT_PLATFORM_DOMAIN = "dsarcheck.com";

/**
 * Product name used in copy, mail subjects and the TOTP issuer.
 *
 * "Privacyspace" is the design handoff's brand, and AGENTS.md requires prototype copy
 * verbatim. The DOMAIN changed to dsarcheck.com (recorded in docs/08 §7); the product
 * NAME did not, so this stays "Privacyspace" unless the owner decides otherwise.
 */
export const BRAND = "Privacyspace";

/** The CNAME target customers point their own domain at. Serves no page itself. */
export const CUSTOM_DOMAIN_TARGET_LABEL = "portals";

/** Same shape as the prototype: 3–30 chars, no leading or trailing hyphen. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/**
 * Names no customer may hold. The infrastructure names exist because a tenant on
 * `admin.dsarcheck.com` would be indistinguishable from the staff console; the brand
 * names because claiming them implies an endorsement the customer does not have.
 *
 * Route names (`app`, `api`, `health`) are included even though the portal is served from
 * a subdomain, so that a future move to path-based routing cannot silently collide.
 */
export const RESERVED_SLUGS = [
  // infrastructure
  "www",
  "admin",
  "administrator",
  "api",
  "app",
  "auth",
  "login",
  "signin",
  "sso",
  "account",
  "billing",
  "pay",
  "payments",
  "status",
  "support",
  "help",
  "docs",
  "blog",
  "go",
  "link",
  "links",
  "track",
  "portal",
  "portals",
  "cdn",
  "static",
  "assets",
  "img",
  "media",
  "files",
  "download",
  // mail and DNS
  "mail",
  "smtp",
  "imap",
  "pop",
  "webmail",
  "email",
  "noreply",
  "no-reply",
  "postmaster",
  "hostmaster",
  "webmaster",
  "abuse",
  "autodiscover",
  "ns1",
  "ns2",
  // trust and legal
  "security",
  "trust",
  "legal",
  "privacy",
  "terms",
  "dpa",
  "gdpr",
  "compliance",
  // environments
  "staging",
  "stage",
  "dev",
  "test",
  "qa",
  "preview",
  "demo",
  "sandbox",
  "internal",
  "vpn",
  // the product's own words
  "dsar",
  "dsarcheck",
  "check",
  "privacyspace",
  // brands a customer might try to claim
  "google",
  "apple",
  "microsoft",
  "amazon",
  "meta",
  "facebook",
  "paypal",
  "stripe",
] as const;

export function isReservedSlug(value: string, extra: readonly string[] = []): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(value) || extra.includes(value);
}

// ── Hosts ────────────────────────────────────────────────────────────────────

export function apexHost(platformDomain: string = DEFAULT_PLATFORM_DOMAIN): string {
  return platformDomain;
}

export function adminHost(platformDomain: string = DEFAULT_PLATFORM_DOMAIN): string {
  return `admin.${platformDomain}`;
}

export function portalHost(
  slug: string,
  platformDomain: string = DEFAULT_PLATFORM_DOMAIN,
): string {
  return `${slug}.${platformDomain}`;
}

export function customDomainTarget(
  platformDomain: string = DEFAULT_PLATFORM_DOMAIN,
): string {
  return `${CUSTOM_DOMAIN_TARGET_LABEL}.${platformDomain}`;
}

// ── Cookies ──────────────────────────────────────────────────────────────────

/**
 * Two session cookies, one per surface, and they are NOT interchangeable.
 *
 * `__Host-` as a prefix is load-bearing: the browser rejects such a cookie unless it is
 * Secure, has no Domain attribute and Path=/. So a customer session can never be scoped
 * to `.dsarcheck.com` — which is the point. A Domain-scoped cookie would be readable by
 * every tenant subdomain, turning one tenant's XSS into every tenant's session.
 *
 * Names are distinct so a misrouted request cannot be authenticated by the wrong surface:
 * the workspace cookie is only meaningful on a portal host, the staff cookie only on the
 * admin host.
 */
export type CookieScope = "workspace" | "staff";

export const WORKSPACE_COOKIE = "dsar_session";
export const WORKSPACE_COOKIE_PROD = "__Host-dsar_session";
export const STAFF_COOKIE = "dsar_staff_session";
export const STAFF_COOKIE_PROD = "__Host-dsar_staff_session";

export function cookieName(scope: CookieScope, production: boolean): string {
  if (scope === "staff") return production ? STAFF_COOKIE_PROD : STAFF_COOKIE;
  return production ? WORKSPACE_COOKIE_PROD : WORKSPACE_COOKIE;
}

/** Which surface a presented cookie belongs to; null when it is not one of ours. */
export function cookieScopeOf(name: string): CookieScope | null {
  switch (name) {
    case WORKSPACE_COOKIE:
    case WORKSPACE_COOKIE_PROD:
      return "workspace";
    case STAFF_COOKIE:
    case STAFF_COOKIE_PROD:
      return "staff";
    default:
      return null;
  }
}
