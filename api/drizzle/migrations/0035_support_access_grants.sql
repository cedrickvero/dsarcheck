-- 0035: support-access grants for G5 "Customer-side support-access approval"
-- (docs/05 § Admin rules, non-negotiable #4: staff see case contents only under a
-- customer-approved, time-limited grant).
--
-- A Platform admin requests access (Requested); the customer owner approves (Active,
-- expires_at = granted_at + 24h) or declines (Declined, with a reason). An owner can End
-- an active grant early. Expiry is lazy: any Active grant past expires_at is treated as
-- Expired. Tenant-isolated like every other customer row; insert/update-only.

CREATE TABLE "support_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id"),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "staff_label" text NOT NULL,
  "scope" text NOT NULL,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'Requested' CHECK ("status" IN ('Requested', 'Active', 'Declined', 'Ended', 'Expired')),
  "requested_at" timestamptz NOT NULL DEFAULT now(),
  "granted_at" timestamptz,
  "declined_at" timestamptz,
  "ended_at" timestamptz,
  "expires_at" timestamptz,
  "decline_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "support_grants_workspace_status_idx" ON "support_grants" ("workspace_id", "status");
--> statement-breakpoint

ALTER TABLE "support_grants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "support_grants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY support_grants_tenant_isolation ON "support_grants"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint

REVOKE TRUNCATE, REFERENCES, TRIGGER ON "support_grants" FROM app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "support_grants" FROM app_tenant;
