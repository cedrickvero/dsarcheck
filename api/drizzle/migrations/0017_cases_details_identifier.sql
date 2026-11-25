-- Cockpit Overview needs the requester's own words (details) and the account identifier they
-- gave. Both are empty-default, like requester_name, so older rows backfill without a
-- fabricated value.
ALTER TABLE "cases" ADD COLUMN "details" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "identifier" text DEFAULT '' NOT NULL;
