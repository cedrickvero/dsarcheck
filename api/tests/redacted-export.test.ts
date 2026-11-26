/**
 * Redacted-export storage + signed-link sharing (Option 3 second artifact type). The
 * redacted export is a human-produced file the handler uploads; recordRedactedExport stores
 * its case_files row (is_redacted_export, version 2 — never an overwrite) and sets the
 * finalExportDone flag, and issueSignedLink/consumeSignedLink handle artifact_type
 * "redacted_export" with the file's sha256 as the bound content hash.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { systemDb } from "@/db/client";
import { cases, caseFiles, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { recordRedactedExport } from "@/server/cases/collection";
import { issueSignedLink, consumeSignedLink } from "@/server/cases/signed-links";
import { fetchRedactedExport } from "@/server/cases/evidence-download";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t13re-${RUN}`;
const caseNum = () => `DSAR-2026-${String(10000 + (Number(RUN) % 40000)).padStart(5, "0")}`;
const openCaseNum = () => `DSAR-2026-${String(50000 + (Number(RUN) % 40000)).padStart(5, "0")}`;
const exportKey = (suffix: string) => `ws/${wsId}/redacted_export/${suffix}`;

let orgId = "";
let wsId = "";
let userId = "";
let caseId = "";
let openCaseId = "";
let actor: Actor;

beforeAll(async () => {
  orgId = (await systemDb.insert(orgs).values({ name: `${tag}-org`, kind: "direct" }).returning({ id: orgs.id }))[0]!.id;
  wsId = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!.id;
  userId = (
    await systemDb
      .insert(users)
      .values({ orgId, workspaceId: wsId, email: `${tag}-owner@example.test`, emailHash: hashEmail(`${tag}-owner@example.test`), role: "owner", mfaRequired: "false" })
      .returning({ id: users.id })
  )[0]!.id;
  actor = { userId, orgId, workspaceId: wsId, roles: ["owner"], label: `${tag}-owner`, mfaSatisfied: true };

  caseId = (
    await systemDb
      .insert(cases)
      .values({ orgId, workspaceId: wsId, caseNumber: caseNum(), requestType: "Access", redactionReview: "done", receivedAt: new Date(), statutoryDueAt: new Date(Date.now() + 30 * 86_400_000) })
      .returning({ id: cases.id })
  )[0]!.id;

  openCaseId = (
    await systemDb
      .insert(cases)
      .values({ orgId, workspaceId: wsId, caseNumber: openCaseNum(), requestType: "Access", redactionReview: "none", receivedAt: new Date(), statutoryDueAt: new Date(Date.now() + 30 * 86_400_000) })
      .returning({ id: cases.id })
  )[0]!.id;
});

const validSha = (ch: string) => ch.repeat(64);

describe("recordRedactedExport", () => {
  it("stores a version-2 redacted-export file and marks the export done", async () => {
    const sha256 = validSha("a");
    const { fileId, finalExportDone } = await recordRedactedExport(actor, caseId, {
      name: "_redacted_v2.pdf",
      type: "application/pdf",
      sizeBytes: 1234,
      storageKey: exportKey("11111111-1111-4111-8111-111111111111"),
      sha256,
    });
    expect(finalExportDone).toBe(true);

    const [file] = await systemDb
      .select({ isRedactedExport: caseFiles.isRedactedExport, version: caseFiles.version, sha256: caseFiles.sha256, storageKey: caseFiles.storageKey, isEvidence: caseFiles.isEvidence })
      .from(caseFiles)
      .where(eq(caseFiles.id, fileId))
      .limit(1);
    expect(file!.isRedactedExport).toBe(true);
    expect(file!.version).toBe(2);
    expect(file!.isEvidence).toBe(false);
    expect(file!.sha256).toBe(sha256);
    expect(file!.storageKey).toBe(exportKey("11111111-1111-4111-8111-111111111111"));

    const [c] = await systemDb.select({ finalExportDone: cases.finalExportDone }).from(cases).where(eq(cases.id, caseId)).limit(1);
    expect(c!.finalExportDone).toBe(true);
  });

  it("rejects the record when redaction review is not done", async () => {
    await expect(
      recordRedactedExport(actor, openCaseId, { name: "v2.pdf", type: "application/pdf", sizeBytes: 1, storageKey: `ws/${wsId}/x`, sha256: validSha("b") }),
    ).rejects.toThrow(/redaction review/);
  });

  it("rejects a malformed sha256", async () => {
    await expect(
      recordRedactedExport(actor, caseId, { name: "v2.pdf", type: "application/pdf", sizeBytes: 1, storageKey: `ws/${wsId}/x`, sha256: "not-a-hash" }),
    ).rejects.toThrow(/valid sha256/);
  });
});

describe("redacted-export signed links", () => {
  it("binds the link to the file sha256 and consumes as redacted_export", async () => {
    const sha256 = validSha("c");
    const { fileId } = await recordRedactedExport(actor, caseId, {
      name: "_redacted_v2.zip",
      type: "application/zip",
      sizeBytes: 999,
      storageKey: exportKey("22222222-2222-4222-8222-222222222222"),
      sha256,
    });

    const issued = await issueSignedLink(actor, { artifactType: "redacted_export", artifactId: fileId, recipientType: "requester", reason: "Share the redacted export" });
    expect(issued.contentHash).toBe(sha256);

    const consumed = await consumeSignedLink(issued.token);
    expect(consumed.status).toBe("ok");
    if (consumed.status === "ok") {
      expect(consumed.artifactType).toBe("redacted_export");
      expect(consumed.artifactId).toBe(fileId);
      expect(consumed.contentHash).toBe(sha256);
    }

    // Single-use still holds for the second artifact type.
    expect((await consumeSignedLink(issued.token)).status).toBe("denied");
  });

  it("rejects issuing a link for a non-redacted-export file", async () => {
    // An ordinary evidence file (not a redacted export) must not be linkable as one.
    const [plain] = await systemDb
      .insert(caseFiles)
      .values({ orgId, workspaceId: wsId, caseId, name: "original.pdf", type: "application/pdf", sizeBytes: 10, uploadedBy: userId, storageKey: `ws/${wsId}/evidence/x`, sha256: validSha("d"), version: 1, isEvidence: true })
      .returning({ id: caseFiles.id });
    await expect(
      issueSignedLink(actor, { artifactType: "redacted_export", artifactId: plain!.id, recipientType: "requester", reason: "Should refuse" }),
    ).rejects.toThrow(/unknown redacted export/);
  });

  it("verifies the bound sha256 before streaming the redacted-export object", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3, 4, 5]);
    const goodHash = createHash("sha256").update(fakeBytes).digest("hex");
    const { fileId } = await recordRedactedExport(actor, caseId, {
      name: "_redacted_v2_integrity.pdf",
      type: "application/pdf",
      sizeBytes: fakeBytes.length,
      storageKey: exportKey("33333333-3333-4333-8333-333333333333"),
      sha256: goodHash,
    });

    const ok = { status: "ok", orgId, workspaceId: wsId, artifactId: fileId, artifactType: "redacted_export", contentHash: goodHash } as const;

    // Matching bytes + hash -> served.
    expect(await fetchRedactedExport(ok, async () => fakeBytes)).not.toBeNull();
    // Tampered hash (or tampered bytes) -> fails closed to null (the route turns this into 404).
    expect(await fetchRedactedExport({ ...ok, contentHash: "0".repeat(64) }, async () => fakeBytes)).toBeNull();
    // Missing/denied object -> fails closed.
    expect(await fetchRedactedExport(ok, async () => null)).toBeNull();
  });
});
