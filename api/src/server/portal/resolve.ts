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
import { classifyHost } from "@/domain/host";

export interface ResolvedPortal {
  orgId: string;
  workspaceId: string;
  name: string;
  subdomain: string;
}

export async function resolvePortalByHost(hostHeader: string | null | undefined): Promise<ResolvedPortal | null> {
  const surface = classifyHost(hostHeader, { platformDomain: process.env.PLATFORM_DOMAIN });
  if (surface.kind !== "portal") return null;
  const slug = surface.slug;

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
