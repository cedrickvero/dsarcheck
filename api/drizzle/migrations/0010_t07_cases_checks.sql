-- T-07: the vocabulary constraints, which drizzle-kit did NOT emit for text-column
-- "enums". The owner requires status CHECK-constrained, and a value the application
-- cannot produce must also be a value the database will not accept.
--
-- As with objects.purpose in R2, the lists are duplicated from TypeScript by necessity
-- (Postgres cannot read it), so tests/cases-schema.test.ts reads these constraints back
-- out of pg_constraint and fails if the two ever drift.
ALTER TABLE "cases" ADD CONSTRAINT cases_status_check
  CHECK ("status" IN ('New','Verifying','In progress','Awaiting approval','Completed','Extended','Rejected'));
--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT cases_request_type_check
  CHECK ("request_type" IN ('Access','Rectification','Erasure','Portability','Objection','Restriction'));
--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT cases_priority_check
  CHECK ("priority" IN ('Normal','High'));
--> statement-breakpoint
-- The number format is structural, not conventional: DSAR-{YYYY}-{5 digits}, zero-padded.
ALTER TABLE "cases" ADD CONSTRAINT cases_number_format_check
  CHECK ("case_number" ~ '^DSAR-[0-9]{4}-[0-9]{5}$');
