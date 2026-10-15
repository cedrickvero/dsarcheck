CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text NOT NULL,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"category" text NOT NULL,
	"reason" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text,
	"meta" jsonb
);
--> statement-breakpoint
CREATE INDEX "audit_events_workspace_at_idx" ON "audit_events" USING btree ("workspace_id","at");

--> statement-breakpoint

-- ============================================================================
-- R1: tenant isolation + append-only audit.
-- Hand-written: Drizzle cannot express roles, RLS policies or triggers.
-- ============================================================================

-- Application role for tenant-scoped work. Superusers bypass RLS entirely, so
-- isolation is only real when queries execute as a NOBYPASSRLS role.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_tenant;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant;
--> statement-breakpoint

-- audit_events: visible only to its owning workspace, and append-only.
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_events_tenant_isolation" ON "audit_events"
  USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "audit_events_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % rejected', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "audit_events_no_mutate"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_append_only"();
--> statement-breakpoint

-- workspaces: a tenant sees only its own row.
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspaces" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspaces_tenant_isolation" ON "workspaces"
  USING (id = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint

-- orgs: a tenant sees only the org that owns its workspace.
ALTER TABLE "orgs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "orgs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "orgs_tenant_isolation" ON "orgs"
  USING (id = (SELECT w.org_id FROM "workspaces" w
               WHERE w.id = nullif(current_setting('app.workspace_id', true), '')::uuid))
  WITH CHECK (id = (SELECT w.org_id FROM "workspaces" w
               WHERE w.id = nullif(current_setting('app.workspace_id', true), '')::uuid));
