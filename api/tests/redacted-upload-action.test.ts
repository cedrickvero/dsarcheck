/**
 * Mechanical wiring checks for the redacted-export upload actions. Server actions are a
 * "use server" boundary: a field the action does not DECLARE and FORWARD is silently dropped
 * at the boundary (the fn-level tests still pass because they call the fn directly). And the
 * mint must use the production permission source, not an allow-all stub. Both are asserted by
 * reading the action source, because the action itself cannot be unit-tested directly.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../src/app/app/cases/actions.ts", import.meta.url), "utf8");
const uploadSrc = readFileSync(new URL("../src/app/app/_components/redacted-export-upload.tsx", import.meta.url), "utf8");

describe("redacted-export upload actions (mechanical wiring)", () => {
  it("recordRedactedExportAction forwards every file field to the server fn", () => {
    expect(src).toContain("storageKey: input.objectKey");
    expect(src).toContain("sha256: input.sha256");
    expect(src).toContain("name: input.name");
    expect(src).toContain("type: input.type");
    expect(src).toContain("sizeBytes: input.sizeBytes");
  });

  it("issueRedactedExportUpload uses the production permission source, never allow-all", () => {
    expect(src).toContain("permissions: workspacePermissionSource");
    expect(src).not.toContain("can: () => true");
    expect(src).not.toContain("can: () => false");
  });

  it("the client echoes the minted SSE headers instead of hardcoding AES256", () => {
    expect(uploadSrc).toContain("...mint.data.sseHeaders");
    expect(uploadSrc).not.toContain('"x-amz-server-side-encryption": "AES256"');
  });
});
