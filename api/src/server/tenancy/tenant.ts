/**
 * Tenant scoping.
 *
 * The active workspace comes from the AUTHENTICATED SESSION AND THE DATABASE, never
 * from caller input. This closes finding O3, where `app.workspace_id` was supplied by
 * the caller: a request body or query parameter naming another workspace can no longer
 * influence which tenant the query runs as.
 *
 * The real enforcement remains Postgres RLS: queries run inside withTenant(), which
 * sets app.workspace_id from the resolved actor, and a missing tenant fails closed
 * rather than leaking rows.
 *
 * Server-only: never import this into a client component.
 */
import { AppError } from "../http/errors";
import type { Actor } from "@/server/auth/require-auth";

/**
 * The tenant an authenticated actor belongs to. Ignores any caller-supplied workspace:
 * the argument exists only so this is explicit at every call site, and a mismatch is a
 * hard error rather than a silent override.
 */
export function workspaceForActor(actor: Actor, callerSuppliedWorkspaceId?: string | null): string {
  if (
    callerSuppliedWorkspaceId !== undefined &&
    callerSuppliedWorkspaceId !== null &&
    callerSuppliedWorkspaceId !== actor.workspaceId
  ) {
    throw new AppError(
      403,
      "forbidden",
      "The requested workspace does not match the authenticated session.",
    );
  }
  return actor.workspaceId;
}

/** Kept for existing callers: resolution now requires an authenticated actor. */
export async function resolveWorkspaceId(_req?: Request): Promise<string> {
  throw new AppError(
    401,
    "unauthenticated",
    "Tenant resolution requires an authenticated session.",
  );
}
