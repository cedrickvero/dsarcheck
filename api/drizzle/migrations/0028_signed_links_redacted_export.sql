-- Signed links now authorize a second artifact type: the redacted export. artifact_id is
-- polymorphic (evidence_packs.id OR case_files.id), so the single evidence_packs FK no
-- longer applies and is dropped; the artifact_type discriminator is constrained to the two
-- values so a bogus type can never be stored. The token-hash RLS policy is unchanged.
ALTER TABLE "signed_links" DROP CONSTRAINT "signed_links_artifact_id_evidence_packs_id_fk";
--> statement-breakpoint
ALTER TABLE "signed_links" ADD CONSTRAINT "signed_links_artifact_type_check" CHECK ("artifact_type" IN ('evidence_pack', 'redacted_export'));
--> statement-breakpoint
-- The redacted export is now an uploadable object purpose, so the SQL allowlist gains it too
-- (tests/objects-schema.test.ts asserts the SQL CHECK and purpose.ts stay in step).
ALTER TABLE "objects" DROP CONSTRAINT "objects_purpose_allowlist";
--> statement-breakpoint
ALTER TABLE "objects" ADD CONSTRAINT "objects_purpose_allowlist" CHECK ("purpose" IN ('evidence', 'identity_document', 'generated_pack', 'redacted_export'));
