/**
 * The authorization seam.
 *
 * R2 requires "authorization before URL generation" to be real and testable, but the
 * permission source does not exist until T-08: requireAuth() throws 501 and there is
 * no role/permission store yet. So the check is an injected dependency.
 *
 *   - production wires the real permission source in T-08
 *   - tests inject a fake that allows or denies on demand
 *
 * Two things are checked, and both must hold:
 *   1. the actor must belong to the workspace it is acting in (tenant match)
 *   2. the permission source must grant the exact permission in that workspace
 *
 * The tenant check lives here as well as in the key validation and the database
 * CHECK, so a cross-tenant mistake has to get past all three.
 */
import type { Actor } from "./require-auth";

export interface PermissionSource {
  can(args: { actor: Actor; workspaceId: string; permission: string }): Promise<boolean> | boolean;
}

export class AuthorizationDeniedError extends Error {
  readonly permission: string;
  readonly workspaceId: string;
  constructor(permission: string, workspaceId: string, detail: string) {
    super(`authorization denied for "${permission}" in workspace ${workspaceId}: ${detail}`);
    this.name = "AuthorizationDeniedError";
    this.permission = permission;
    this.workspaceId = workspaceId;
  }
}

/**
 * Throws AuthorizationDeniedError unless the actor may exercise `permission` in
 * `workspaceId`. Callers must treat a throw as "do nothing": no URL, no row.
 */
export async function authorize(args: {
  actor: Actor;
  workspaceId: string;
  permission: string;
  source: PermissionSource;
}): Promise<void> {
  const { actor, workspaceId, permission, source } = args;

  if (actor.workspaceId !== workspaceId) {
    throw new AuthorizationDeniedError(permission, workspaceId, "actor belongs to another workspace");
  }

  const allowed = await source.can({ actor, workspaceId, permission });
  if (!allowed) {
    throw new AuthorizationDeniedError(permission, workspaceId, "permission not granted");
  }
}
