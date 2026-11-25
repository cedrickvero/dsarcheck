CREATE TABLE "notification_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"notification_key" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_systems" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_reads_user_key_idx" ON "notification_reads" USING btree ("user_id","notification_key");--> statement-breakpoint
CREATE INDEX "notification_reads_workspace_user_idx" ON "notification_reads" USING btree ("workspace_id","user_id");--> statement-breakpoint
-- notification_reads is a customer-owned table: tenant isolation, no-delete.
ALTER TABLE "notification_reads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification_reads" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notification_reads_tenant_isolation ON "notification_reads"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid) WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "notification_reads" TO app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "notification_reads" FROM app_runtime;
