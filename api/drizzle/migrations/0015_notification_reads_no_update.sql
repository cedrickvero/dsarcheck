-- Guardrail L-6: notification_reads was granted UPDATE but the schema never uses it —
-- read marks are idempotent INSERTs (ON CONFLICT DO NOTHING). Drop the unused privilege
-- from both principals (app_tenant inherits default grants for general tables, so it held
-- UPDATE too, and least privilege is per-table).
REVOKE UPDATE ON "notification_reads" FROM app_runtime;
--> statement-breakpoint
REVOKE UPDATE ON "notification_reads" FROM app_tenant;
