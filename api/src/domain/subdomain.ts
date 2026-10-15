/**
 * Subdomain validation (docs/03 § F, docs/05 § Portal setup).
 *
 * TODO(domain slice): port checkSub() from the workspace logic. Rules: reserved
 * and taken lists, must match the verified domain, and a non-matching name
 * creates a SubdomainReview for Admin rather than silently failing.
 */
export type SubdomainResult =
  | { ok: true; subdomain: string }
  | { ok: false; reason: "reserved" | "taken" | "invalid" | "domain_mismatch" };

export function checkSub(_candidate: string, _verifiedDomain?: string): SubdomainResult {
  throw new Error("checkSub() not implemented — port from design/reference/logic/workspace-logic.js");
}
