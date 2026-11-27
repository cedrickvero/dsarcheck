-- 0034: extension flow + "approver reviews extensions" gate (G15, docs/05 § Extension)
--
-- `cases.extension_requested_months` is the pending sub-state: when the workspace setting
-- `approver_reviews_extensions` is on, an extension request stores its months here instead of
-- applying immediately; the approver then approves (extensionMonths += N, status Extended) or
-- rejects (clears the pending). When the setting is off (default), the extension applies
-- immediately and this column stays null.

ALTER TABLE "workspaces" ADD COLUMN "approver_reviews_extensions" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

ALTER TABLE "cases" ADD COLUMN "extension_requested_months" smallint
  CONSTRAINT "cases_extension_requested_months_check" CHECK ("extension_requested_months" IN (1, 2) OR "extension_requested_months" IS NULL);
