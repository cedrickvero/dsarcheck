-- Evidence-pack versions (docs/04 EvidencePack). Content is a JSON snapshot of the
-- nine-section document; the PDF/ZIP bytes are a storage-slice concern. RLS, tenant
-- policy, grants and the version vocabulary are added by hand (drizzle emits none).
CREATE TABLE "evidence_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"draft" boolean DEFAULT true NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content" jsonb
);
--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD CONSTRAINT "evidence_packs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD CONSTRAINT "evidence_packs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD CONSTRAINT "evidence_packs_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD CONSTRAINT "evidence_packs_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_packs_case_version_idx" ON "evidence_packs" USING btree ("case_id","version");
--> statement-breakpoint
CREATE INDEX "evidence_packs_workspace_case_idx" ON "evidence_packs" USING btree ("workspace_id","case_id");
--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD CONSTRAINT evidence_packs_version_check CHECK ("version" > 0);
--> statement-breakpoint
ALTER TABLE "evidence_packs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "evidence_packs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY evidence_packs_tenant_isolation ON "evidence_packs"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid) WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "evidence_packs" TO app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "evidence_packs" FROM app_runtime;
