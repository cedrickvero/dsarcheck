-- Multi-workspace membership (docs/04 Membership): one row per (user, workspace), the model
-- the agency dashboard and the future workspace switcher need. RLS is ORG-scoped on purpose
-- (a user sees their org's roster, like a team directory) so an agency owner can enumerate
-- client workspaces. workspace_name is denormalised from workspaces because that table's
-- workspace-scoped RLS hides siblings.
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workspace_name" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_workspace_idx" ON "memberships" USING btree ("user_id","workspace_id");
--> statement-breakpoint
CREATE INDEX "memberships_org_idx" ON "memberships" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX "memberships_workspace_idx" ON "memberships" USING btree ("workspace_id");
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY memberships_org_isolation ON "memberships"
  USING ("org_id" = (NULLIF(current_setting('app.org_id', true), ''))::uuid)
  WITH CHECK ("org_id" = (NULLIF(current_setting('app.org_id', true), ''))::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "memberships" TO app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "memberships" FROM app_runtime;
