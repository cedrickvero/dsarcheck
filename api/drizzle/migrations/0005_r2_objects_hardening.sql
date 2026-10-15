-- R2 hardening - guardrail finding F-1.
--
-- 0003 granted SELECT, INSERT, UPDATE, DELETE blanket-wide to app_runtime (and set
-- matching DEFAULT PRIVILEGES); 0004 revoked only TRUNCATE/REFERENCES/TRIGGER on
-- objects. DELETE was never withdrawn, so the application principal could remove
-- object metadata silently and with no audit event - a destructive action with no
-- human approval, which the product's non-negotiables forbid.
--
-- Deleting a DSAR object is an R4 concern: it must go through an explicit, approved,
-- audited path. Until then the app role must not hold the privilege at all.
REVOKE DELETE ON "objects" FROM app_runtime;
--> statement-breakpoint
-- Stop a future table from silently inheriting DELETE the same way.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE ON TABLES FROM app_runtime;
