-- Identity tab: the verification facts live on the case. The recorded decision is the
-- audit log's "Identity approved / rejected / more info" event, not a column - so the
-- display and the audit history can never disagree.
ALTER TABLE "cases" ADD COLUMN "email_confirmed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "identifier_match" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "identifier_note" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "id_document_provided" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "identity_verified" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "info_requested" boolean DEFAULT false NOT NULL;
