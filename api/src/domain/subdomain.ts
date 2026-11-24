/**
 * Subdomain validation — ported from `checkSub()` in
 * `design/reference/logic/workspace-logic.js`; rules in docs/05 § Portal setup.
 *
 * A name that is valid but does not match the verified domain is NOT a failure:
 * it is accepted and queued for manual review, with that explanation shown to the
 * customer. Only invalid, reserved and taken names are refused.
 */
import {
  DEFAULT_PLATFORM_DOMAIN,
  RESERVED_SLUGS,
  isValidSlug,
  portalHost,
} from "./platform";
import type { SubdomainStatus } from "./types";

export type SubdomainReason = "invalid" | "reserved" | "taken";

export interface SubdomainResult {
  /** What the portal's `subdomainStatus` becomes. */
  status: SubdomainStatus;
  /** The normalised candidate, lower-cased and trimmed. */
  subdomain: string;
  /** True when the name matches the verified domain and is claimed instantly. */
  matchesDomain: boolean;
  /** Customer-facing message; "" when claimed, since nothing needs saying. */
  message: string;
  /** Present only when the name was refused. */
  reason?: SubdomainReason;
}

/**
 * Protected brand, system and infrastructure names. The list lives in `platform.ts`
 * because host classification needs it too — a reserved name must be refused whether it
 * arrives as a slug claim or as a Host header.
 */
export const RESERVED_SUBDOMAINS = RESERVED_SLUGS;

export interface CheckSubOptions {
  /** Names already claimed by another workspace. */
  taken?: readonly string[];
  /** Override the reserved list (Admin may reserve more). */
  reserved?: readonly string[];
  /** The platform domain the host is built from. Defaults to dsarcheck.com. */
  platformDomain?: string;
}

/**
 * `verifiedDomain` is the workspace's verified email domain, e.g. `lumen.io`;
 * the root is its first label (`lumen`).
 */
export function checkSub(
  candidate: string,
  verifiedDomain: string,
  options: CheckSubOptions = {},
): SubdomainResult {
  const value = candidate.trim().toLowerCase();
  const taken = options.taken ?? [];
  const reserved = options.reserved ?? RESERVED_SUBDOMAINS;
  const platform = options.platformDomain ?? DEFAULT_PLATFORM_DOMAIN;

  if (!isValidSlug(value)) {
    return {
      status: "none",
      subdomain: value,
      matchesDomain: false,
      reason: "invalid",
      message:
        "Use 3–30 lowercase letters, numbers or hyphens. It can’t start or end with a hyphen.",
    };
  }

  if (reserved.includes(value)) {
    return {
      status: "none",
      subdomain: value,
      matchesDomain: false,
      reason: "reserved",
      message: `“${value}” is reserved. Brand and system names are protected and can’t be claimed.`,
    };
  }

  if (taken.includes(value)) {
    return {
      status: "none",
      subdomain: value,
      matchesDomain: false,
      reason: "taken",
      message: `${portalHost(value, platform)} is already in use.`,
    };
  }

  const host = verifiedDomain.split("@").pop() ?? verifiedDomain;
  const root = host.split(".")[0] ?? "";
  const matchesDomain =
    value.length >= 3 && (root !== "" && (value.includes(root) || root.startsWith(value)));

  if (matchesDomain) {
    return { status: "claimed", subdomain: value, matchesDomain: true, message: "" };
  }

  return {
    status: "review",
    subdomain: value,
    matchesDomain: false,
    message:
      `${portalHost(value, platform)} doesn’t match your verified domain (${verifiedDomain}), ` +
      `so a person checks it before it’s released. This usually takes one business day.`,
  };
}
