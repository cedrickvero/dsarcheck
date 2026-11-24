CREATE TABLE "case_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"status" text DEFAULT 'Not started' NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "requester_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "requester_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "extension_months" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "case_systems" ADD CONSTRAINT "case_systems_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_systems" ADD CONSTRAINT "case_systems_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_systems" ADD CONSTRAINT "case_systems_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "case_systems_case_source_idx" ON "case_systems" USING btree ("case_id","source_key");--> statement-breakpoint
CREATE INDEX "case_systems_workspace_status_idx" ON "case_systems" USING btree ("workspace_id","status");--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cases_workspace_due_idx" ON "cases" USING btree ("workspace_id","statutory_due_at");--> statement-breakpoint
-- ══════════════════════════════════════════════════════════════════════════════
-- T-07 case list: vocabulary constraints and the tenant pattern, added by hand.
--
-- drizzle-kit emits neither text-column CHECK constraints nor RLS/grants, and both are
-- required here: a status the application cannot produce must also be one the database
-- rejects (as with cases_status_check), and a new customer table without FORCED RLS
-- would silently opt out of tenant isolation.
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE "case_systems" ADD CONSTRAINT case_systems_status_check
  CHECK ("status" IN ('Not started','In progress','Completed','Not found','Action required','Retained under exception'));
--> statement-breakpoint
-- The statutory extension is 0, 1 or 2 months; anything else is a data-entry error that
-- would move a legal deadline.
ALTER TABLE "cases" ADD CONSTRAINT cases_extension_months_check
  CHECK ("extension_months" BETWEEN 0 AND 2);
--> statement-breakpoint
ALTER TABLE "case_systems" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "case_systems" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY case_systems_tenant_isolation ON "case_systems"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid) WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "case_systems" TO app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "case_systems" FROM app_runtime;
