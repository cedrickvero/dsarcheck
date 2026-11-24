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
   * Customer-owned domain claims, with their verification state. Omit when the caller
   * cannot know; the resolution then reports `verified: undefined` rather than guessing.
   *
   * A claim is used rather than a `Set<string>` on purpose: a set of "verified" names can
   * be built from an unverified row by mistake, and the mistake is invisible. Here an
   * unverified claim cannot be expressed as a verified one.
   */
  customDomainClaims?: readonly CustomDomainClaim[];
}

/**
 * A customer's request to serve a portal on their own domain.
 *
 * `txtVerifiedAt` is the ONLY thing that makes the host a tenant (docs/08 §7): the customer
 * publishes a TXT record, we observe it, and only then may the host be classified as
 * verified; certificate issuance comes after that. `removedAt` keeps the row for the audit
 * trail instead of deleting it, and a removed claim is treated as absent.
 */
export interface CustomDomainClaim {
  /** Normalised, lower-case, no port, no trailing dot. */
  hostname: string;
  /** TXT record name and expected value, e.g. `_dsarcheck-challenge.privacy.acme.com`. */
  txtRecordName: string;
  txtRecordValue: string;
  /** When the TXT record was observed. Null until then. */
  txtVerifiedAt: Date | null;
  /** Set by the deployment platform once an on-demand certificate exists. */
  certificateIssuedAt?: Date | null;
  removedAt?: Date | null;
}

/**
 * Which custom domains the deployment may now request a certificate for.
 *
 * Encoding the ORDER here - TXT first, certificate second - is the point: a caller that
 * iterates claims to provision TLS has no path that issues for an unverified name, because
 * the filter is what produces the list.
 */
export function domainsEligibleForCertificate(
  claims: readonly CustomDomainClaim[],
): string[] {
  return claims
    .filter(
      (claim) =>
        claim.txtVerifiedAt !== null &&
        !claim.certificateIssuedAt &&
        !claim.removedAt,
    )
    .map((claim) => claim.hostname);
}

export type UnknownReason =
  | "missing-host"
  | "malformed-host"
  | "reserved-slug"
  | "unknown-slug"
  | "nested-subdomain"
  | "unverified-custom-domain"
  /* A claim exists but its TXT ownership record has not been verified, or the claim was
     removed. Until TXT passes, the host must not be treated as a tenant - and no
     certificate should have been requested for it. */
  | "custom-domain-unverified";

export type HostSurface =
  | { kind: "apex"; host: string }
  /* `www.` is NOT the apex: it serves nothing and permanently redirects to it, so that
     the marketing origin is a single origin (one canonical URL, one certificate, one
     cookie jar that stays empty). */
  | { kind: "www"; host: string }
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

  if (host === apexHost(platform)) {
    return { kind: "apex", host };
  }

  if (host === `www.${platform}`) {
    return { kind: "www", host };
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

  // A host we do not own: only a claim whose TXT ownership record has passed may serve a
  // portal. Certificate issuance is downstream of that check, never a substitute for it.
  if (ctx.customDomainClaims === undefined) {
    return { kind: "custom-domain", host, verified: undefined };
  }

  const claim = ctx.customDomainClaims.find(
    (candidate) => candidate.hostname === host && !candidate.removedAt,
  );
  if (!claim) {
    return { kind: "unknown", host, reason: "unverified-custom-domain" };
  }
  if (!claim.txtVerifiedAt) {
    return { kind: "unknown", host, reason: "custom-domain-unverified" };
  }
  return { kind: "custom-domain", host, verified: true };
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
 * `https://www.dsarcheck.com/pricing?x=1` -> `https://dsarcheck.com/pricing?x=1`
 * `https://dsarcheck.com/acme/app`        -> `https://acme.dsarcheck.com/app`
 *
 * `www` is a permanent redirect, not a served surface: one canonical marketing origin means
 * one certificate to keep valid and one origin whose cookie jar stays empty.
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

  if (surface.kind === "www") {
    const path = input.pathname.startsWith("/") ? input.pathname : `/${input.pathname}`;
    return { status: 301, location: `https://${platform}${path}${input.search ?? ""}` };
  }

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
