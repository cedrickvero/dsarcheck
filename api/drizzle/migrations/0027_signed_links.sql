-- Signed links for evidence-pack artifacts (Option 3 storage slice): a 24-hour, single-use
-- token that authorizes a controlled download of ONE evidence-pack version. The token is
-- stored ONLY as a SHA-256 hash; the artifact id, workspace, issuer, recipient type, expiry
-- and a content hash are bound to the row, so a consumed/expired/revoked/replayed token fails
-- closed. Two access paths, mirrored from magic_links: the workspace isolation policy (staff
-- issuance inside the tenant) and a token-hash policy (the unauthenticated download lookup,
-- where holding the hash IS the credential).
CREATE TABLE "signed_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"artifact_type" text NOT NULL,
	"artifact_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"issued_by" uuid NOT NULL,
	"recipient_type" text NOT NULL,
	"content_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signed_links" ADD CONSTRAINT "signed_links_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "signed_links" ADD CONSTRAINT "signed_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "signed_links" ADD CONSTRAINT "signed_links_artifact_id_evidence_packs_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."evidence_packs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "signed_links" ADD CONSTRAINT "signed_links_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "signed_links_token_hash_idx" ON "signed_links" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "signed_links_workspace_idx" ON "signed_links" USING btree ("workspace_id");
--> statement-breakpoint
ALTER TABLE "signed_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "signed_links" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY signed_links_workspace_isolation ON "signed_links"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint
CREATE POLICY signed_links_token_access ON "signed_links" FOR ALL
  USING ("token_hash" = current_setting('app.signed_link_token_hash', true))
  WITH CHECK ("token_hash" = current_setting('app.signed_link_token_hash', true));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "signed_links" TO app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "signed_links" FROM app_runtime;
