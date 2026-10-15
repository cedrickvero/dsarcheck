/**
 * Compatibility adapter. The REAL authorization matrix lives in src/server/authz.ts,
 * transcribed from design/docs/01 § Permissions.
 *
 * This module previously threw 501 - it was a stub. It now answers for real, so
 * `mutate()` and every future route share one source of truth for "may this actor do
 * this", which is what docs/06 requires ("every server action calls it").
 */
import { can as canRole, type Permission } from "@/server/authz";
import type { Actor } from "@/server/auth/require-auth";

export type { Actor, Role } from "@/server/auth/require-auth";
export {
  DECIDING_ROLES,
  MFA_REQUIRED_ROLES,
  WORKSPACE_PERMISSIONS,
  can as canRole,
  permissionsFor,
  requiresMfa,
} from "@/server/authz";

/**
 * Actor-shaped form of the matrix: true if ANY of the actor's roles grants the action.
 * An unknown action is NOT allowed - an unrecognised permission string is a bug in the
 * caller, not a licence to proceed.
 */
export function can(actor: Actor, action: string, _resource?: unknown): boolean {
  return actor.roles.some((role) => {
    try {
      return canRole(role, action as Permission);
    } catch {
      return false;
    }
  });
}
