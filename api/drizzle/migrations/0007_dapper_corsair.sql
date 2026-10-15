CREATE TABLE "magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email_hash" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "magic_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "mfa_totp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_iv" text NOT NULL,
	"secret_tag" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"last_used_step" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket_key" text NOT NULL,
	"scope" text NOT NULL,
	"workspace_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"privilege_epoch" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"mfa_satisfied_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"email_hash" text NOT NULL,
	"role" text NOT NULL,
	"mfa_required" text DEFAULT 'false' NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_totp" ADD CONSTRAINT "mfa_totp_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_totp" ADD CONSTRAINT "mfa_totp_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_totp" ADD CONSTRAINT "mfa_totp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "magic_links_workspace_id_idx" ON "magic_links" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "mfa_totp_user_id_idx" ON "mfa_totp" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rate_limit_hits_bucket_scope_at_idx" ON "rate_limit_hits" USING btree ("bucket_key","scope","at");--> statement-breakpoint
CREATE INDEX "sessions_workspace_id_idx" ON "sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_workspace_id_idx" ON "users" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "users_email_hash_idx" ON "users" USING btree ("email_hash");
--> statement-breakpoint
-- ══════════════════════════════════════════════════════════════════════════════
-- T-08 auth substrate: RLS, the pre-auth lookup policies, least-privilege grants.
--
-- Every table here is tenant-scoped. Two of them additionally need to be readable
-- BEFORE a tenant is known (redeem a magic link; resolve a session), so they carry a
-- second policy keyed on the hash of the credential the caller actually presented.
-- Both policies fail closed when their GUC is unset, because `col = NULL` is never
-- true. The app sets these GUCs server-side from the presented credential only.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_tenant_isolation ON "users"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid) WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint
CREATE POLICY users_email_lookup ON "users" FOR SELECT
  USING ("email_hash" = current_setting('app.lookup_email_hash', true));
--> statement-breakpoint

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sessions_tenant_isolation ON "sessions"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid) WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint
CREATE POLICY sessions_token_lookup ON "sessions" FOR SELECT
  USING ("token_hash" = current_setting('app.session_token_hash', true));
--> statement-breakpoint

ALTER TABLE "magic_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "magic_links" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY magic_links_tenant_isolation ON "magic_links"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid) WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint
CREATE POLICY magic_links_token_lookup ON "magic_links" FOR SELECT
  USING ("token_hash" = current_setting('app.magic_token_hash', true));
--> statement-breakpoint

ALTER TABLE "mfa_totp" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "mfa_totp" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mfa_totp_tenant_isolation ON "mfa_totp"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid) WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint

-- rate_limit_hits carries no customer data (a hash, a scope, a timestamp) and must be
-- countable BEFORE sign-in, so its policy is "the current tenant, or no tenant yet".
ALTER TABLE "rate_limit_hits" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rate_limit_hits" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY rate_limit_hits_tenant_or_preauth ON "rate_limit_hits"
  USING ("workspace_id" IS NULL OR "workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK ("workspace_id" IS NULL OR "workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint

-- Least privilege: SELECT/INSERT/UPDATE only. No DELETE on any of these tables - note
-- that DELETE is withheld globally from both app roles (migrations 0005/0006 and
-- db-ensure-runtime-role.mjs), and db-verify-invariants asserts that stays true.
GRANT SELECT, INSERT, UPDATE ON "users" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "sessions" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "magic_links" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "mfa_totp" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON "rate_limit_hits" TO app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "users" FROM app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "sessions" FROM app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "magic_links" FROM app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "mfa_totp" FROM app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "rate_limit_hits" FROM app_runtime;
--> statement-breakpoint

-- Expiry cleanup for rate-limit rows, WITHOUT granting the app role DELETE on any
-- table. SECURITY DEFINER lets the function (owned by the migration role) delete, but
-- its WHERE clause is the only thing it can ever delete: rows already past expiry.
-- tests/auth-ratelimit.test.ts proves it cannot remove an unexpired row.
CREATE OR REPLACE FUNCTION cleanup_rate_limit_hits() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM rate_limit_hits WHERE expires_at < now();
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cleanup_rate_limit_hits() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cleanup_rate_limit_hits() TO app_runtime;
