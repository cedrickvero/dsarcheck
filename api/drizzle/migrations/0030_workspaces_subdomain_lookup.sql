-- 0030: workspaces subdomain-lookup policy
--
-- The public intake form resolves the portal HOST to a workspace by its subdomain, with no
-- session. The workspaces table is self-scoped (`id = app.workspace_id`), so a tenant-less
-- request cannot read it — and the resolver must find the workspace BY subdomain, not id.
-- This additive SELECT policy mirrors the credential-hash lookups (magic/session/signed):
-- app.lookup_subdomain is set server-side from the classified Host, and the policy exposes
-- exactly the one workspace whose subdomain matches (no enumeration — you must know the
-- exact subdomain). The workspace's id/org_id are consumed only server-side; the client
-- never receives them.

CREATE POLICY workspaces_subdomain_lookup ON "workspaces" FOR SELECT
  USING ("subdomain" = current_setting('app.lookup_subdomain', true));
