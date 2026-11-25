-- Approval & response tab: the selected response template lives on the case.
ALTER TABLE "cases" ADD COLUMN "template" text DEFAULT '' NOT NULL;
