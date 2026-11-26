/**
 * In-app file preview: "Open original · logged" (reason-required, per-viewer audited) and the
 * authenticated content resolver (RBAC + RLS + injectable object read). The bytes themselves
 * cannot be read from dev MinIO (underscore hostname), so the object read is injected.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { systemDb } from "@/db/client";
import { auditEvents, cases, caseFiles, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { openOriginalFile } from "@/server/cases/collection";
import { loadCaseFileBytes } from "@/server/cases/file-content";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t14fp-${RUN}`;
const caseNum = (n: number) => `DSAR-2026-${String(n).padStart(5, "0")}`;

let orgId = "";
let wsId = "";
let wsId2 = "";
let caseId = "";
let otherCaseId = "";
let fileId = "";
let redactedFileId = "";
let owner: Actor;
let systemOwner: Actor;
let actorOtherWs: Actor;

beforeAll(async () => {
  orgId = (await systemDb.insert(orgs).values({ name: `${tag}-org`, kind: "direct" }).returning({ id: orgs.id }))[0]!.id;
  wsId = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!.id;
  const mkUser = async (role: "owner" | "system_owner", label: string) =>
    (await systemDb.insert(users).values({ orgId, workspaceId: wsId, email: `${tag}-${label}@example.test`, emailHash: hashEmail(`${tag}-${label}@example.test`), role, mfaRequired: "false" }).returning({ id: users.id }))[0]!.id;
  const ownerId = await mkUser("owner", "owner");
  const systemOwnerId = await mkUser("system_owner", "sysowner");
  owner = { userId: ownerId, orgId, workspaceId: wsId, roles: ["owner"], label: `${tag}-owner`, mfaSatisfied: true };
  systemOwner = { userId: systemOwnerId, orgId, workspaceId: wsId, roles: ["system_owner"], label: `${tag}-sysowner`, mfaSatisfied: true };

  wsId2 = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws2` }).returning({ id: workspaces.id }))[0]!.id;
  const otherWsUserId = (
    await systemDb.insert(users).values({ orgId, workspaceId: wsId2, email: `${tag}-otherws@example.test`, emailHash: hashEmail(`${tag}-otherws@example.test`), role: "owner", mfaRequired: "false" }).returning({ id: users.id })
  )[0]!.id;
  actorOtherWs = { userId: otherWsUserId, orgId, workspaceId: wsId2, roles: ["owner"], label: `${tag}-otherws`, mfaSatisfied: true };

  caseId = (await systemDb.insert(cases).values({ orgId, workspaceId: wsId, caseNumber: caseNum(10000 + (Number(RUN) % 40000)), requestType: "Access", receivedAt: new Date(), statutoryDueAt: new Date(Date.now() + 30 * 86_400_000) }).returning({ id: cases.id }))[0]!.id;
  otherCaseId = (await systemDb.insert(cases).values({ orgId, workspaceId: wsId, caseNumber: caseNum(50000 + (Number(RUN) % 40000)), requestType: "Access", receivedAt: new Date(), statutoryDueAt: new Date(Date.now() + 30 * 86_400_000) }).returning({ id: cases.id }))[0]!.id;

  fileId = (
    await systemDb
      .insert(caseFiles)
      .values({ orgId, workspaceId: wsId, caseId, name: "original.pdf", type: "application/pdf", sizeBytes: 10, uploadedBy: owner.userId, storageKey: `ws/${wsId}/evidence/11111111-1111-4111-8111-111111111111`, sha256: "a".repeat(64), version: 1, isEvidence: true })
      .returning({ id: caseFiles.id })
  )[0]!.id;
  redactedFileId = (
    await systemDb
      .insert(caseFiles)
      .values({ orgId, workspaceId: wsId, caseId, name: "_redacted_v2.pdf", type: "application/pdf", sizeBytes: 6, uploadedBy: owner.userId, storageKey: `ws/${wsId}/redacted_export/22222222-2222-4222-8222-222222222222`, sha256: "b".repeat(64), version: 2, isEvidence: false, isRedactedExport: true })
      .returning({ id: caseFiles.id })
  )[0]!.id;
});

describe("openOriginalFile", () => {
  it("writes a reason-required, per-viewer audit event and returns a signed URL", async () => {
    const result = await openOriginalFile(owner, caseId, fileId, "reviewing the flagged PII");
    expect(result.url).toBeTruthy();
    const rows = await systemDb.select({ action: auditEvents.action, reason: auditEvents.reason, objectId: auditEvents.objectId }).from(auditEvents).where(eq(auditEvents.objectId, fileId));
    const opened = rows.find((r) => r.action === "Original file opened");
    expect(opened).toBeTruthy();
    expect(opened!.reason).toBe("reviewing the flagged PII");
  });

  it("rejects a short reason", async () => {
    await expect(openOriginalFile(owner, caseId, fileId, "no")).rejects.toThrow(/at least 3 characters/);
  });

  it("rejects a file from a different case", async () => {
    await expect(openOriginalFile(owner, otherCaseId, fileId, "wrong case")).rejects.toThrow(/unknown file/);
  });

  it("rejects a file from another workspace (tenant isolation)", async () => {
    await expect(openOriginalFile(actorOtherWs, caseId, fileId, "cross-workspace")).rejects.toThrow(/unknown file/);
  });

  it("denies a system_owner (not in export_evidence_packs)", async () => {
    await expect(openOriginalFile(systemOwner, caseId, fileId, "trying to view")).rejects.toThrow(/does not permit/);
  });
});

describe("loadCaseFileBytes", () => {
  const bytes = new Uint8Array([9, 8, 7]);

  it("returns the bytes for a redacted export", async () => {
    const res = await loadCaseFileBytes(owner, caseId, redactedFileId, async () => bytes);
    expect(res).not.toBeNull();
    expect(res!.isRedactedExport).toBe(true);
    expect(res!.filename).toBe("_redacted_v2.pdf");
    expect([...res!.bytes]).toEqual([9, 8, 7]);
  });

  it("returns null for an original (bytes served only via the open-original signed URL)", async () => {
    expect(await loadCaseFileBytes(owner, caseId, fileId, async () => bytes)).toBeNull();
  });

  it("returns null for a file of a different case", async () => {
    expect(await loadCaseFileBytes(owner, otherCaseId, redactedFileId, async () => bytes)).toBeNull();
  });

  it("returns null for a file from another workspace (tenant isolation)", async () => {
    expect(await loadCaseFileBytes(actorOtherWs, caseId, redactedFileId, async () => bytes)).toBeNull();
  });

  it("returns null when the object is missing", async () => {
    expect(await loadCaseFileBytes(owner, caseId, redactedFileId, async () => null)).toBeNull();
  });

  it("denies a system_owner", async () => {
    await expect(loadCaseFileBytes(systemOwner, caseId, redactedFileId, async () => bytes)).rejects.toThrow(/does not permit/);
  });
});
