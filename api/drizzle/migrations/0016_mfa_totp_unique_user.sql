-- Guardrail L-2: one TOTP row per user. A reload before confirming used to insert a second
-- unconfirmed secret, and loadSecret (no ORDER BY) could read the stale one and make
-- confirmation intermittently fail. beginEnrolment now upserts an unconfirmed secret; the
-- unique index enforces one row and closes the concurrent-enrol race.
DROP INDEX IF EXISTS "mfa_totp_user_id_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_totp_user_id_idx" ON "mfa_totp" ("user_id");
