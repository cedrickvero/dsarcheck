CREATE TABLE "case_number_seq" (
	"workspace_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "case_number_seq_workspace_id_year_pk" PRIMARY KEY("workspace_id","year")
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"case_number" text NOT NULL,
	"request_type" text NOT NULL,
	"priority" text DEFAULT 'Normal' NOT NULL,
	"status" text DEFAULT 'New' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"statutory_due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_number_seq" ADD CONSTRAINT "case_number_seq_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cases_workspace_number_idx" ON "cases" USING btree ("workspace_id","case_number");--> statement-breakpoint
CREATE INDEX "cases_workspace_status_idx" ON "cases" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "cases_workspace_received_idx" ON "cases" USING btree ("workspace_id","received_at");
--> statement-breakpoint
-- ══════════════════════════════════════════════════════════════════════════════
-- T-07 case entity: RLS, tenant policy, least-privilege grants.
-- Both tables are tenant-scoped with no pre-auth lookup, so a single tenant policy
-- each and no hash-keyed second policy (unlike the T-08 token tables).
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE "cases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cases" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY cases_tenant_isolation ON "cases"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid) WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint
ALTER TABLE "case_number_seq" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "case_number_seq" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY case_number_seq_tenant_isolation ON "case_number_seq"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid) WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "cases" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "case_number_seq" TO app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "cases" FROM app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "case_number_seq" FROM app_runtime;
