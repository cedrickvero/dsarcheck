/**
 * Authorization: the real `can(actor, action, resource)`.
 *
 * The matrix is transcribed from design/docs/01 § "Permissions" - the
 * Handler / System owner / Approver / Admin table. `owner` is the top workspace role
 * (product copy says "founder"; docs/01 calls it Admin) and holds every workspace
 * permission. `system_owner` is scoped to their own system: they may record outcomes
 * but may not approve identity, approve closure or export evidence packs.
 *
 * Design rule from docs/06: "every server action calls it." This module is the single
 * place that answers "may this actor do this", so a route cannot invent its own answer.
 */
import type { Role } from "@/server/auth/require-auth";

export const WORKSPACE_PERMISSIONS = [
  "view_and_update_cases",
  "record_system_outcomes",
  "approve_identity",
  "approve_closure",
  "export_evidence_packs",
  "configure_workspace",
  // R4 erasure contract. `record` is the act of deciding an outcome for a system;
  // the Approver "doesn't work the case" (docs/01) so they are NOT in this list -
  // their role is review, which is a separate permission.
  "erasure.outcome.record",
  // High-risk erasure decisions are Approver-only (owner-approved R4 contract).
  "erasure.outcome.record.high_risk",
  "erasure.case.approve",
] as const;

export type Permission = (typeof WORKSPACE_PERMISSIONS)[number];

/** Roles permitted to DECIDE an erasure outcome. Exported so R4's gate and this matrix cannot drift. */
export const DECIDING_ROLES: readonly Role[] = [
  "owner",
  "workspace_admin",
  "request_handler",
  "system_owner",
];

const MATRIX: Readonly<Record<Permission, readonly Role[]>> = {
  view_and_update_cases: ["owner", "workspace_admin", "request_handler", "approver", "system_owner"],
  record_system_outcomes: ["owner", "workspace_admin", "request_handler", "system_owner", "approver"],
  approve_identity: ["owner", "workspace_admin", "request_handler", "approver"],
  approve_closure: ["owner", "workspace_admin", "approver"],
  export_evidence_packs: ["owner", "workspace_admin", "request_handler", "approver"],
  configure_workspace: ["owner", "workspace_admin"],
  "erasure.outcome.record": ["owner", "workspace_admin", "request_handler", "system_owner"],
  "erasure.outcome.record.high_risk": ["owner", "approver"],
  "erasure.case.approve": ["owner", "workspace_admin", "approver"],
};

/** Roles that must satisfy MFA. Owner decision: privileged roles only. */
export const MFA_REQUIRED_ROLES: readonly Role[] = ["owner", "approver", "workspace_admin"];

export function can(role: Role, permission: Permission): boolean {
  const allowed = MATRIX[permission];
  // An unrecognised permission is a caller bug. Deny rather than throw, so a typo
  // fails closed instead of turning into a 500 that hides the real problem.
  if (!allowed) return false;
  return allowed.includes(role);
}

/** Every permission this role holds. Used by tests to prove the matrix is total. */
export function permissionsFor(role: Role): Permission[] {
  return WORKSPACE_PERMISSIONS.filter((p) => can(role, p));
}

export function requiresMfa(role: Role): boolean {
  return MFA_REQUIRED_ROLES.includes(role);
}
