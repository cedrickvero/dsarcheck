-- Erasure outcomes: each system records its outcome and when it was recorded.
ALTER TABLE "case_systems" ADD COLUMN "outcome" text;
--> statement-breakpoint
ALTER TABLE "case_systems" ADD COLUMN "outcome_at" timestamp with time zone;
