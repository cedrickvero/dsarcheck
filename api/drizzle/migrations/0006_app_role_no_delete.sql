-- Guardrail F-1, completed.
--
-- 0005 revoked DELETE on objects from app_runtime only. Two things made that
-- insufficient, both proven:
--   1. app_runtime is a MEMBER of app_tenant, so it INHERITS app_tenant's blanket
--      DELETE from 0002 - revoking from the member alone changes nothing.
--      (`select has_table_privilege('app_runtime','objects','DELETE')` stayed true.)
--   2. db-ensure-runtime-role.mjs re-grants "select, insert, update, delete on all
--      tables" and runs AFTER migrations, so it silently undid 0005 on every
--      `npm run db:migrate`. The script is fixed in the same change.
--
-- No relation in this schema needs DELETE from the application: the audit trail is
-- append-only by design, and deleting a DSAR object is a destructive action that
-- must go through an explicit, approved, audited path (R4). Until that path exists
-- the privilege must be ABSENT for both roles, not merely discouraged.
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM app_runtime;
--> statement-breakpoint
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM app_tenant;
--> statement-breakpoint
-- and stop future tables from inheriting it
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE ON TABLES FROM app_runtime;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE ON TABLES FROM app_tenant;
