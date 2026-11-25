-- Normalize the outcome encoding to the R4 snake_case keys, then constrain it so no
-- non-canonical value can ever be stored (display labels are a presentation concern).
UPDATE "case_systems" SET "outcome" = CASE "outcome"
  WHEN 'Deleted' THEN 'deleted'
  WHEN 'Suppressed / anonymized' THEN 'suppressed'
  WHEN 'Retained under exception' THEN 'retained_under_exception'
  WHEN 'Not found' THEN 'not_found'
  WHEN 'Action required' THEN 'action_required'
  ELSE "outcome"
END
WHERE "outcome" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "case_systems" ADD CONSTRAINT "case_systems_outcome_check"
  CHECK ("outcome" IN ('deleted','suppressed','retained_under_exception','not_found','action_required') OR "outcome" IS NULL);
