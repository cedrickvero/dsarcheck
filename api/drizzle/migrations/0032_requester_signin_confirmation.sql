-- 0032: requester portal sign-in (link + code) + email-confirmation tokens
--
-- Requesters have no user account, so a second credential store is needed:
--   requester_tokens   single-use link+code (purpose 'sign_in') and single-use
--                      confirmation links (purpose 'confirm_email').
--   requester_sessions workspace + email scoped sessions, 30-minute idle.
-- cases.email_verification supports G2 (the "Email confirmed" landing).

CREATE TABLE "requester_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id"),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "purpose" text NOT NULL CHECK ("purpose" IN ('sign_in', 'confirm_email')),
  "email_hash" text NOT NULL,
  "email" text NOT NULL,
  "case_id" uuid REFERENCES "cases"("id"),
  "token_hash" text NOT NULL UNIQUE,
  "code_hash" text,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "requester_tokens_workspace_id_idx" ON "requester_tokens" ("workspace_id");
--> statement-breakpoint
CREATE INDEX "requester_tokens_email_purpose_idx" ON "requester_tokens" ("email_hash", "purpose");
--> statement-breakpoint
-- A 6-digit code is not globally unique: two requesters could draw the same code in the
-- same 15-minute window. This partial index makes an ACTIVE code unique per workspace so
-- the issue step regenerates on collision instead of letting a code redeem the wrong row.
CREATE UNIQUE INDEX "requester_tokens_active_code_idx" ON "requester_tokens" ("workspace_id", "code_hash")
  WHERE "code_hash" IS NOT NULL AND "used_at" IS NULL;
--> statement-breakpoint

CREATE TABLE "requester_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id"),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "email_hash" text NOT NULL,
  "email" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz
);
--> statement-breakpoint
CREATE INDEX "requester_sessions_workspace_id_idx" ON "requester_sessions" ("workspace_id");
--> statement-breakpoint
CREATE INDEX "requester_sessions_email_hash_idx" ON "requester_sessions" ("email_hash");
--> statement-breakpoint

ALTER TABLE "cases" ADD COLUMN "email_verification" text NOT NULL DEFAULT 'Unverified'
  CONSTRAINT "cases_email_verification_check" CHECK ("email_verification" IN ('Unverified', 'Confirmed'));
--> statement-breakpoint

ALTER TABLE "requester_tokens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "requester_tokens" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY requester_tokens_tenant_isolation ON "requester_tokens"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint
-- Link redemption: the caller holds only the token; the policy keyed on its hash exposes
-- exactly the one row, so it cannot enumerate or consume another requester's link.
CREATE POLICY requester_tokens_link_lookup ON "requester_tokens" FOR ALL
  USING ("token_hash" = current_setting('app.requester_token_hash', true))
  WITH CHECK ("token_hash" = current_setting('app.requester_token_hash', true));
--> statement-breakpoint

ALTER TABLE "requester_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "requester_sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY requester_sessions_tenant_isolation ON "requester_sessions"
  USING ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK ("workspace_id" = (NULLIF(current_setting('app.workspace_id', true), ''))::uuid);
--> statement-breakpoint
CREATE POLICY requester_sessions_token_lookup ON "requester_sessions" FOR SELECT
  USING ("token_hash" = current_setting('app.requester_session_token_hash', true));
--> statement-breakpoint

REVOKE TRUNCATE, REFERENCES, TRIGGER ON "requester_tokens" FROM app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "requester_tokens" FROM app_tenant;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "requester_sessions" FROM app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "requester_sessions" FROM app_tenant;
