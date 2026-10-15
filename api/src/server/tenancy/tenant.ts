import { AppError } from "../http/errors";

/**
 * Tenant scoping.
 *
 * Resolves the active workspace (subdomain for intake/portal, session for the
 * workspace app). The real enforcement is Postgres RLS: request-scoped queries
 * run inside withTenant(), which sets app.workspace_id, so a missing tenant
 * fails closed instead of leaking rows.
 *
 * TODO(tenancy slice, T-08): resolve from Host header / session.
 *
 * Server-only: never import this into a client component.
 */
export async function resolveWorkspaceId(): Promise<string> {
  throw new AppError(501, "not_implemented", "Tenant resolution is not implemented yet");
}
