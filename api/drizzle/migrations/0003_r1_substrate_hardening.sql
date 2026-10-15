-- 0003 · R1 substrate hardening
--
-- Carries the guardrail's blocking findings (B1, B2, B6) into the database so
-- that `npm run db:migrate` *enforces* the invariants instead of leaving them
-- to developer discipline. Every statement is idempotent and re-runnable.

-- ─── B1 · least-privilege runtime role ───────────────────────────────────────
-- The application must never connect as the owner or a superuser: both bypass
-- RLS unconditionally, which makes every isolation test pass while isolating
-- nothing. `app_runtime` is NOLOGIN + NOBYPASSRLS, owns nothing, and is a
-- member of `app_tenant`; application connections assume it with SET ROLE.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
--> statement-breakpoint
ALTER ROLE app_runtime NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
--> statement-breakpoint
GRANT app_tenant TO app_runtime;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
--> statement-breakpoint
-- Append-only means nothing may remove rows wholesale and nothing may rewrite
-- the schema. TRUNCATE fires no row triggers, so it would bypass the
-- append-only guard completely.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM app_runtime;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM app_runtime;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM app_tenant;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
--> statement-breakpoint

-- ─── B2 · TRUNCATE guard ─────────────────────────────────────────────────────
-- The row-level trigger cannot see TRUNCATE (statement-level, fires no row
-- triggers), so audit history could be wiped silently and without trace.
CREATE OR REPLACE FUNCTION audit_events_reject_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: TRUNCATE rejected';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_events_no_truncate ON "audit_events";
--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_reject_truncate();
--> statement-breakpoint

-- ─── B6 · tenant integrity for audit rows ────────────────────────────────────
-- An audit row must reference a real workspace and org, otherwise tenancy in
-- the audit trail is unverifiable. Added NOT VALID so the migration cannot
-- fail on pre-existing rows; new writes are still enforced immediately, and
-- scripts/db-verify-invariants.mjs reports any historical violations.
ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS audit_events_workspace_fk;
--> statement-breakpoint
ALTER TABLE "audit_events"
  ADD CONSTRAINT audit_events_workspace_fk
  FOREIGN KEY (workspace_id) REFERENCES "workspaces"(id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS audit_events_org_fk;
--> statement-breakpoint
ALTER TABLE "audit_events"
  ADD CONSTRAINT audit_events_org_fk
  FOREIGN KEY (org_id) REFERENCES "orgs"(id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint

-- ─── attribution must be present ─────────────────────────────────────────────
-- docs/05: an audit event without actor, action, category and reason is not an
-- audit event. Enforced in the database, not only in the mutate() helper.
ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS audit_events_attribution_present;
--> statement-breakpoint
ALTER TABLE "audit_events"
  ADD CONSTRAINT audit_events_attribution_present
  CHECK (
    length(btrim(actor_id)) > 0
    AND length(btrim(actor_label)) > 0
    AND length(btrim(action)) > 0
    AND length(btrim(category)) > 0
    AND length(btrim(reason)) > 0
    AND length(btrim(object_type)) > 0
  ) NOT VALID;
