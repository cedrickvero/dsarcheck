/**
 * Portal host -> workspace resolution for the PUBLIC intake surface.
 *
 * The tenant is derived from the Host header ONLY (never the path, query or body — see
 * domain/host.ts). The middleware classifies a well-formed subdomain as a portal but has no
 * database; here, under the subdomain-lookup policy, the slug is resolved to the owning
 * workspace. An unknown, malformed or non-portal host resolves to null (fail closed) — the
 * caller renders 404, so the intake surface cannot enumerate workspaces.
 *
 * The returned orgId/workspaceId are consumed server-side only; the client never sees them.
 */
import { eq } from "drizzle-orm";
import { workspaces } from "@/db/schema";
import { withLookup } from "@/db/client";
import { classifyHost, type HostSurface } from "@/domain/host";

export interface ResolvedPortal {
  orgId: string;
  workspaceId: string;
  name: string;
  subdomain: string;
}

/**
 * The ONLY tenant discriminator: a surface contributes a slug iff it is a portal. The Host
 * is the sole input; a non-portal surface yields no slug, so it can never resolve a
 * workspace (the type-level guard in resolvePortalByHost is belt-and-braces over this).
 */
export function portalSlug(surface: HostSurface): string | null {
  return surface.kind === "portal" ? surface.slug : null;
}

export async function resolvePortalByHost(hostHeader: string | null | undefined): Promise<ResolvedPortal | null> {
  const surface = classifyHost(hostHeader, { platformDomain: process.env.PLATFORM_DOMAIN });
  const slug = portalSlug(surface);
  if (!slug) return null;

  const rows = await withLookup({ portalSubdomain: slug }, (tx) =>
    tx
      .select({ id: workspaces.id, orgId: workspaces.orgId, name: workspaces.name, subdomain: workspaces.subdomain })
      .from(workspaces)
      .where(eq(workspaces.subdomain, slug))
      .limit(1),
  );
  const ws = rows[0];
  if (!ws) return null;
  return { orgId: ws.orgId, workspaceId: ws.id, name: ws.name, subdomain: ws.subdomain ?? slug };
}
