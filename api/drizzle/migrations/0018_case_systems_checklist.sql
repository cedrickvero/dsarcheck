-- Checklist tab: a system row needs its assignee, due date, search method and, for the
-- outcome states, a reason (Not found / Action required) and an exception category
-- (Retained under exception). All optional except the empty-default texts.
ALTER TABLE "case_systems" ADD COLUMN "owner_id" uuid REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "case_systems" ADD COLUMN "due_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "case_systems" ADD COLUMN "search_method" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "case_systems" ADD COLUMN "reason" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "case_systems" ADD COLUMN "exception_category" text;
