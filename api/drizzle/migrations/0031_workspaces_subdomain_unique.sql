-- 0031: workspaces subdomain uniqueness
--
-- The intake resolver maps a portal Host to exactly one workspace by subdomain. Until now
-- that was a convention, so two workspaces sharing a subdomain could route a requester's
-- submission to the wrong tenant. A UNIQUE partial index (non-null subdomains only — a
-- workspace may have none) makes "one workspace per subdomain" a database invariant.

CREATE UNIQUE INDEX workspaces_subdomain_unique ON "workspaces" ("subdomain")
  WHERE "subdomain" IS NOT NULL;
