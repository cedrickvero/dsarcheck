-- Collection & redaction (Access cases): case files + flagged redaction tokens, and the
-- case-level review/export state. drizzle-kit emits the schema; the RLS, tenant policy,
-- grants and vocabulary CHECKs below are added by hand (drizzle emits none of them).
ALTER TABLE "cases" ADD COLUMN "redaction_review" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "final_export_done" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE "case_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"source_key" text,
	"name" text NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"uploaded_by" uuid,
	"storage_key" text DEFAULT '' NOT NULL,
	"sha256" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"needs_redaction" boolean DEFAULT false NOT NULL,
	"is_redacted_export" boolean DEFAULT false NOT NULL,
	"is_evidence" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redaction_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"page" integer,
	"category" text NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"redacted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "redaction_tokens" ADD CONSTRAINT "redaction_tokens_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "redaction_tokens" ADD CONSTRAINT "redaction_tokens_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "redaction_tokens" ADD CONSTRAINT "redaction_tokens_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "redaction_tokens" ADD CONSTRAINT "redaction_tokens_file_id_case_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."case_files"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "case_files_case_name_version_idx" ON "case_files" USING btree ("case_id","name","version");
--> statement-breakpoint
CREATE INDEX "case_files_workspace_case_idx" ON "case_files" USING btree ("workspace_id","case_id");
--> statement-breakpoint
CREATE INDEX "redaction_tokens_file_idx" ON "redaction_tokens" USING btree ("file_id");
--> statement-breakpoint
CREATE INDEX "redaction_tokens_case_idx" ON "redaction_tokens" USING btree ("case_id");
--> statement-breakpoint
-- Vocabulary CHECKs: a category the app cannot produce must also be one the DB rejects.
ALTER TABLE "cases" ADD CONSTRAINT cases_redaction_review_check
  CHECK ("redaction_review" IN ('none','requested','done'));
--> statement-breakpoint
ALTER TABLE "redaction_tokens" ADD CONSTRAINT redaction_tokens_category_check
  CHECK ("category" IN ('Name','Email','Phone number','ID number','Third-party personal data','Confidential free-text note'));
--> statement-breakpoint
-- Tenant isolation: FORCED RLS + tenant policy + least privilege (no DELETE, ever).
ALTER TABLE "case_files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "case_files" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY case_files_tenant_isolation ON "case_files"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid) WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "case_files" TO app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "case_files" FROM app_runtime;
--> statement-breakpoint
ALTER TABLE "redaction_tokens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "redaction_tokens" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY redaction_tokens_tenant_isolation ON "redaction_tokens"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid) WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "redaction_tokens" TO app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "redaction_tokens" FROM app_runtime;
