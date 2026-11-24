/**
 * Host classification — which surface is this request for?
 *
 * The four surfaces are distinct origins on purpose (see `platform.ts`): the landing page
 * has no tenant, the staff console has a different cookie and a different role, and each
 * customer portal is its own origin with its own host-only session cookie.
 *
 * On a portal host, `Host` is the ONLY source of tenant. It is never read from the path,
 * the query string or a body field, so a request cannot name a workspace it is not on.
 *
 * Pure and edge-safe: no env reads beyond what the caller passes, no I/O.
 */
import {
  CUSTOM_DOMAIN_TARGET_LABEL,
  DEFAULT_PLATFORM_DOMAIN,
  adminHost,
  apexHost,
  cookieScopeOf,
  isReservedSlug,
  isValidSlug,
  type CookieScope,
} from "./platform";

export interface HostContext {
  platformDomain?: string;
  /** Extra names the operator has reserved beyond `RESERVED_SLUGS`. */
  reserved?: readonly string[];
  /**
   * Slugs that actually exist. Omit when the caller cannot know (middleware runs on the
   * edge with no database) — the resolver then classifies a well-formed subdomain as a
   * portal and the server-side tenant lookup decides whether it exists.
   */
  knownSlugs?: ReadonlySet<string>;
  /**
   * Customer-owned domains whose DNS has been verified. Omit when the caller cannot
   * know; the resolution then reports `verified: undefined` rather than guessing.
   */
  verifiedCustomDomains?: ReadonlySet<string>;
}

export type UnknownReason =
  | "missing-host"
  | "malformed-host"
  | "reserved-slug"
  | "unknown-slug"
  | "nested-subdomain"
  | "unverified-custom-domain";

export type HostSurface =
  | { kind: "apex"; host: string }
  | { kind: "admin"; host: string }
  | { kind: "portal"; slug: string; host: string }
  | { kind: "custom-domain"; host: string; verified: boolean | undefined }
  | { kind: "unknown"; host: string; reason: UnknownReason };

const MAX_HOST_LENGTH = 253;
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Lower-case, drop the port, drop the trailing dot. Returns null when the value could not
 * be a host at all — a caller that cannot parse `Host` must not fall back to the apex.
 */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let host = raw.trim().toLowerCase();
  // IPv6 literals are not a valid Host for this product.
  if (host.startsWith("[")) return null;
  // Strip a port, but only a numeric one: `example.com:8080` yes, `a:b:c` no.
  const portMatch = /:(\d{1,5})$/.exec(host);
  if (portMatch) host = host.slice(0, -portMatch[0].length);
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.length === 0 || host.length > MAX_HOST_LENGTH) return null;
  const labels = host.split(".");
  if (labels.length < 2) return null;
  for (const label of labels) {
    if (!LABEL_PATTERN.test(label)) return null;
  }
  return host;
}

export function classifyHost(raw: string | null | undefined, ctx: HostContext = {}): HostSurface {
  const platform = ctx.platformDomain ?? DEFAULT_PLATFORM_DOMAIN;
  const host = normalizeHost(raw);

  if (!host) {
    return {
      kind: "unknown",
      host: raw ?? "",
      reason: raw && raw.trim() ? "malformed-host" : "missing-host",
    };
  }

  if (host === apexHost(platform) || host === `www.${platform}`) {
    return { kind: "apex", host };
  }

  if (host === adminHost(platform)) {
    return { kind: "admin", host };
  }

  if (host === `${CUSTOM_DOMAIN_TARGET_LABEL}.${platform}`) {
    // The CNAME target itself serves nothing: a request that arrives here has not been
    // mapped to a customer domain.
    return { kind: "unknown", host, reason: "reserved-slug" };
  }

  if (host.endsWith(`.${platform}`)) {
    const label = host.slice(0, -(platform.length + 1));
    if (label.includes(".")) {
      return { kind: "unknown", host, reason: "nested-subdomain" };
    }
    if (isReservedSlug(label, ctx.reserved)) {
      return { kind: "unknown", host, reason: "reserved-slug" };
    }
    if (!isValidSlug(label)) {
      return { kind: "unknown", host, reason: "malformed-host" };
    }
    if (ctx.knownSlugs && !ctx.knownSlugs.has(label)) {
      return { kind: "unknown", host, reason: "unknown-slug" };
    }
    return { kind: "portal", slug: label, host };
  }

  // A host we do not own: only a verified customer domain may serve a portal.
  if (ctx.verifiedCustomDomains === undefined) {
    return { kind: "custom-domain", host, verified: undefined };
  }
  if (ctx.verifiedCustomDomains.has(host)) {
    return { kind: "custom-domain", host, verified: true };
  }
  return { kind: "unknown", host, reason: "unverified-custom-domain" };
}

/** Paths the apex serves itself; they can never be a workspace slug. */
const APEX_ROUTES = [
  "app",
  "api",
  "health",
  "forbidden",
  "privacy",
  "terms",
  "legal",
  "pricing",
  "about",
  "contact",
  "security",
  "trust",
  "docs",
  "blog",
  "login",
  "signin",
  "signup",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  "_next",
];

export interface RedirectInput {
  host: string | null | undefined;
  pathname: string;
  search?: string;
  ctx?: HostContext;
}

/**
 * `https://dsarcheck.com/acme/app` -> `https://acme.dsarcheck.com/app`
 *
 * A printed link or an old email must not break, but the apex must not serve tenant
 * content either: path-based tenants share one origin, so they share cookies, cache and
 * CSP. A permanent redirect keeps the URL people already have and moves them to an
 * origin that is actually isolated.
 *
 * Returns null when there is nothing to redirect — either the path is not slug-shaped, or
 * it is a real apex route, or the caller told us the slug does not exist.
 */
export function canonicalRedirect(input: RedirectInput): { status: 301; location: string } | null {
  const ctx = input.ctx ?? {};
  const platform = ctx.platformDomain ?? DEFAULT_PLATFORM_DOMAIN;
  const surface = classifyHost(input.host, ctx);
  if (surface.kind !== "apex") return null;

  const segments = input.pathname.split("/").filter(Boolean);
  const first = segments[0];
  if (!first) return null;

  const candidate = first.toLowerCase();
  if (APEX_ROUTES.includes(candidate)) return null;
  if (isReservedSlug(candidate, ctx.reserved)) return null;
  if (!isValidSlug(candidate)) return null;
  if (ctx.knownSlugs && !ctx.knownSlugs.has(candidate)) return null;

  const rest = segments.slice(1).join("/");
  const path = rest ? `/${rest}` : "/";
  const search = input.search ?? "";
  return { status: 301, location: `https://${candidate}.${platform}${path}${search}` };
}

/**
 * May a cookie issued for `scope` authenticate on this surface?
 *
 * The whole point of separate origins: a staff cookie presented to a tenant host, or a
 * workspace cookie presented to the staff console, must be refused rather than
 * interpreted. The apex serves no authenticated content at all.
 */
export function cookieAllowedOnSurface(
  scope: CookieScope,
  surface: HostSurface["kind"],
): boolean {
  if (scope === "staff") return surface === "admin";
  return surface === "portal" || surface === "custom-domain";
}

/** Scope of any cookie presented on a request, when it is one of ours. */
export function presentedCookieScopes(cookieHeader: string | null): CookieScope[] {
  if (!cookieHeader) return [];
  const scopes = new Set<CookieScope>();
  for (const part of cookieHeader.split(";")) {
    const name = part.trim().split("=")[0];
    if (!name) continue;
    const scope = cookieScopeOf(name);
    if (scope) scopes.add(scope);
  }
  return [...scopes];
}
