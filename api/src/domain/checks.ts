/**
 * Pre-closure checks (docs/05 § Gates).
 *
 * TODO(domain slice): port checks() from
 * `design/reference/seed/workspace-seed.js`. Behaviour differs by request type
 * (erasure vs access), so test both paths, including:
 *   - evidence present for every completed checklist row
 *   - identity verified before closure
 *   - deletion rows carry an approval
 *   - required reason captured on every sensitive action
 */
export interface PreClosureCheck {
  id: string;
  label: string;
  satisfied: boolean;
}

export function checks(_caseLike: unknown): PreClosureCheck[] {
  throw new Error("checks() not implemented — port from design/reference/seed/workspace-seed.js");
}
