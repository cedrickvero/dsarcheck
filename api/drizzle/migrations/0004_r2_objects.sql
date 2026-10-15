CREATE TABLE "objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"purpose" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint,
	"uploader_actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objects_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE INDEX "objects_workspace_created_idx" ON "objects" USING btree ("workspace_id","created_at");

--> statement-breakpoint
-- R2: tenant integrity -------------------------------------------------------
-- FKs are validated (not NOT VALID): the table is created by this migration and
-- is empty, so there is no history to exempt.
ALTER TABLE "objects"
  ADD CONSTRAINT "objects_workspace_fk" FOREIGN KEY ("workspace_id")
  REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "objects"
  ADD CONSTRAINT "objects_org_fk" FOREIGN KEY ("org_id")
  REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint
-- The object key must belong to the row's own workspace. With this, a row whose
-- key points at another tenant is impossible to store, not merely discouraged.
ALTER TABLE "objects"
  ADD CONSTRAINT "objects_key_workspace_prefix"
  CHECK ("object_key" LIKE 'ws/' || "workspace_id"::text || '/%');
--> statement-breakpoint
-- purpose is limited to the server-side allowlist. Postgres cannot read
-- purpose.ts, so tests/objects-schema.test.ts reads this constraint back out of
-- pg_constraint and fails if the two lists ever diverge.
ALTER TABLE "objects"
  ADD CONSTRAINT "objects_purpose_allowlist"
  CHECK ("purpose" IN ('evidence', 'identity_document', 'generated_pack'));
--> statement-breakpoint
-- content_type must be a plausible media type, not free text.
ALTER TABLE "objects"
  ADD CONSTRAINT "objects_content_type_shape"
  CHECK ("content_type" ~ '^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$');
--> statement-breakpoint
-- R2: row-level security -----------------------------------------------------
ALTER TABLE "objects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "objects" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS objects_tenant_isolation ON "objects";
--> statement-breakpoint
CREATE POLICY objects_tenant_isolation ON "objects"
  FOR ALL
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
-- Least privilege for the application principal. app_runtime itself is created
-- and granted by scripts/db-ensure-runtime-role.mjs, which runs after migrations.
GRANT SELECT, INSERT, UPDATE ON "objects" TO app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "objects" FROM app_runtime;
