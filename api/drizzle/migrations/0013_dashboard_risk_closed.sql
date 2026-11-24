ALTER TABLE "cases" ADD COLUMN "risk" text DEFAULT 'Low' NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT cases_risk_check
  CHECK ("risk" IN ('Low','Medium','High'));
