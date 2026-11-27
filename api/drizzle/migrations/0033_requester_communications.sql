-- 0033: requester communications (messages) for G18 "Requester replies in the workspace"
--
-- A requester can send a message from the portal. It is stored as a Communication
-- (docs/04) with direction Inbound and channel Portal; outbound comms (email responses)
-- reuse the same table with direction Outbound / channel Email. Tenant-isolated like every
-- other customer row, insert/update-only (no delete) via the runtime-role grant.

CREATE TABLE "communications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id"),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "case_id" uuid NOT NULL REFERENCES "cases"("id"),
  "direction" text NOT NULL CHECK ("direction" IN ('Inbound', 'Outbound')),
  "channel" text NOT NULL CHECK ("channel" IN ('Email', 'Portal')),
  "subject" text NOT NULL DEFAULT '',
  "body" text NOT NULL DEFAULT '',
  "at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "communications_workspace_case_idx" ON "communications" ("workspace_id", "case_id");
--> statement-breakpoint

ALTER TABLE "communications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "communications" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY communications_tenant_isolation ON "communications"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint

REVOKE TRUNCATE, REFERENCES, TRIGGER ON "communications" FROM app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "communications" FROM app_tenant;
