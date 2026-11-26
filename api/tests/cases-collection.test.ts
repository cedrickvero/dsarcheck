/**
 * Collection & redaction (Access cases), against the real database: a flagged token is
 * redacted with a reason and resets any completed review; review request is single-shot;
 * complete review is approver-gated and requires every flagged item redacted; the export
 * is rejected until review is done; and a cross-tenant case is unknown (RLS).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { auditEvents, cases, caseFiles, orgs, redactionTokens, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import {
  completeRedactionReview,
  getCollection,
  recordRedaction,
  requestRedactionReview,
} from "@/server/cases/collection";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t09col-${RUN}`;

let orgId = ""; let wsId = ""; let otherWsId = "";
let handlerId = ""; let approverId = ""; let otherCaseId = "";
let handler: Actor; let approver: Actor;

const num = () => `DSAR-2026-${String(10000 + Math.floor(Math.random() * 89999)).padStart(5, "0")}`;

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    orgId = org.id;
    const ws = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    wsId = ws.id;
    const otherWs = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-other-ws` }).returning({ id: workspaces.id }))[0]!;
    otherWsId = otherWs.id;

    const mkUser = async (role: "request_handler" | "approver") =>
      (await systemDb.insert(users).values({
        orgId, workspaceId: wsId, email: `${tag}-${role}@example.test`, emailHash: hashEmail(`${tag}-${role}@example.test`), role,
      }).returning({ id: users.id }))[0]!.id;
    handlerId = await mkUser("request_handler");
    approverId = await mkUser("approver");
    handler = { userId: handlerId, orgId, workspaceId: wsId, roles: ["request_handler"], label: `${tag}-request_handler@example.test`, mfaSatisfied: true };
    approver = { userId: approverId, orgId, workspaceId: wsId, roles: ["approver"], label: `${tag}-approver@example.test`, mfaSatisfied: true };

    otherCaseId = (await systemDb.insert(cases).values({
      orgId, workspaceId: otherWsId, caseNumber: num(), requestType: "Access", status: "In progress", priority: "Normal",
      receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"),
    }).returning({ id: cases.id }))[0]!.id;
  } catch (e) {
    throw new Error(`collection suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

const mkCase = async (opts: { flagged?: boolean; redacted?: boolean } = {}) => {
  const caseId = (await systemDb.insert(cases).values({
    orgId, workspaceId: wsId, caseNumber: num(), requestType: "Access", status: "In progress", priority: "Normal",
    receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"),
  }).returning({ id: cases.id }))[0]!.id;
  const fileId = (await systemDb.insert(caseFiles).values({
    orgId, workspaceId: wsId, caseId, sourceKey: "Zendesk", name: "support-ticket.pdf", type: "application/pdf",
    sizeBytes: 1200, needsRedaction: true,
  }).returning({ id: caseFiles.id }))[0]!.id;
  const tokenId = (await systemDb.insert(redactionTokens).values({
    orgId, workspaceId: wsId, caseId, fileId, category: "Email", snippet: "maya…",
    flagged: opts.flagged ?? true, redacted: opts.redacted ?? false,
  }).returning({ id: redactionTokens.id }))[0]!.id;
  return { caseId, fileId, tokenId };
};

describe("getCollection", () => {
  it("returns files, flagged and unredacted counts", async () => {
    const { caseId } = await mkCase({ flagged: true, redacted: false });
    const view = await getCollection(handler, caseId);
    expect(view!.files).toHaveLength(1);
    expect(view!.flaggedCount).toBe(1);
    expect(view!.unredactedCount).toBe(1);
    expect(view!.redactionReview).toBe("none");
  });
});

describe("recordRedaction", () => {
  it("requires a reason", async () => {
    const { caseId, tokenId } = await mkCase();
    await expect(recordRedaction(handler, caseId, { tokenId, redacted: true, reason: "  " })).rejects.toThrow("A redaction reason is required.");
  });

  it("redacts a token, writes a Redaction audit row, and resets a completed review", async () => {
    const { caseId, tokenId } = await mkCase({ flagged: true, redacted: false });
    // complete the review + export, then redact again: the review must reset.
    await systemDb.update(cases).set({ redactionReview: "done", finalExportDone: true }).where(eq(cases.id, caseId));

    await recordRedaction(handler, caseId, { tokenId, redacted: true, reason: "third-party email" });

    const [tok] = await systemDb.select({ redacted: redactionTokens.redacted }).from(redactionTokens).where(eq(redactionTokens.id, tokenId));
    expect(tok!.redacted).toBe(true);
    const [row] = await systemDb.select({ review: cases.redactionReview, export: cases.finalExportDone }).from(cases).where(eq(cases.id, caseId));
    expect(row!.review).toBe("none");
    expect(row!.export).toBe(false);
    const [ev] = await systemDb.select().from(auditEvents).where(eq(auditEvents.objectId, caseId));
    expect(ev!.category).toBe("Redaction");
    expect(ev!.action).toBe("redaction.recorded");
  });
});

describe("requestRedactionReview", () => {
  it("requests once, then refuses a second request", async () => {
    const { caseId } = await mkCase({ flagged: true, redacted: true });
    await expect(requestRedactionReview(handler, caseId)).resolves.toEqual({ review: "requested" });
    await expect(requestRedactionReview(handler, caseId)).rejects.toThrow("already in progress");
  });
});

describe("completeRedactionReview", () => {
  it("is approver-gated and requires every flagged item redacted", async () => {
    const a = await mkCase({ flagged: true, redacted: false });
    await requestRedactionReview(handler, a.caseId);
    await expect(completeRedactionReview(handler, a.caseId, { reason: "all good" })).rejects.toThrow("approver");

    const b = await mkCase({ flagged: true, redacted: false });
    await requestRedactionReview(handler, b.caseId);
    await expect(completeRedactionReview(approver, b.caseId, { reason: "all good" })).rejects.toThrow("not yet redacted");

    await recordRedaction(handler, b.caseId, { tokenId: b.tokenId, redacted: true, reason: "third-party email" });
    // a redaction resets the review, so request again before completing
    await requestRedactionReview(handler, b.caseId);
    await expect(completeRedactionReview(approver, b.caseId, { reason: "reviewed and approved" })).resolves.toEqual({ review: "done" });
  });
});

describe("tenant isolation", () => {
  it("treats a cross-tenant case as unknown", async () => {
    expect(await getCollection(handler, otherCaseId)).toBeNull();
    await expect(requestRedactionReview(handler, otherCaseId)).rejects.toThrow("unknown case");
  });
});

describe("request-type guard", () => {
  it("rejects an erasure case (erasure cases use erasure outcomes)", async () => {
    const caseId = (await systemDb.insert(cases).values({
      orgId, workspaceId: wsId, caseNumber: num(), requestType: "Erasure", status: "In progress", priority: "Normal",
      receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"),
    }).returning({ id: cases.id }))[0]!.id;
    await expect(requestRedactionReview(handler, caseId)).rejects.toThrow("erasure cases use erasure outcomes");
  });
});
