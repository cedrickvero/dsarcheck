/**
 * Erasure outcomes, against the real database: an outcome is recorded with a reason, a
 * retained outcome needs an exception category, a high-risk case needs an approver, and a
 * cross-tenant case is unknown (RLS).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { auditEvents, cases, caseSystems, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { EXCEPTION_CATEGORIES } from "@/server/cases/checklist";
import { getErasureOutcomes, recordErasureOutcome } from "@/server/cases/erasure";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t08er-${RUN}`;

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
      orgId, workspaceId: otherWsId, caseNumber: num(), requestType: "Erasure", status: "In progress", priority: "Normal",
      receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"), risk: "Low",
    }).returning({ id: cases.id }))[0]!.id;
  } catch (e) {
    throw new Error(`erasure suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

const mkCase = async (risk: "Low" | "High") => {
  const id = (await systemDb.insert(cases).values({
    orgId, workspaceId: wsId, caseNumber: num(), requestType: "Erasure", status: "In progress", priority: "Normal",
    receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"), risk,
  }).returning({ id: cases.id }))[0]!.id;
  await systemDb.insert(caseSystems).values([
    { orgId, workspaceId: wsId, caseId: id, sourceKey: "db", name: "Production database", status: "Completed", evidenceCount: 0 },
    { orgId, workspaceId: wsId, caseId: id, sourceKey: "stripe", name: "Stripe", status: "Completed", evidenceCount: 0 },
  ]);
  return id;
};

describe("recordErasureOutcome", () => {
  it("records an outcome with a reason and writes an erasure audit row", async () => {
    const id = await mkCase("Low");
    const result = await recordErasureOutcome(handler, id, { sourceKey: "db", outcome: "Deleted", reason: "rows hard-deleted" });
    expect(result.outcome).toBe("Deleted");
    const [ev] = await systemDb.select().from(auditEvents).where(eq(auditEvents.objectId, id));
    expect(ev!.category).toBe("Erasure");
    expect(ev!.action).toContain("Deleted");
  });

  it("a retained outcome needs an exception category", async () => {
    const id = await mkCase("Low");
    await expect(
      recordErasureOutcome(handler, id, { sourceKey: "db", outcome: "Retained under exception", reason: "tax law" }),
    ).rejects.toThrow("an exception category is required");
    await expect(
      recordErasureOutcome(handler, id, { sourceKey: "db", outcome: "Retained under exception", reason: "tax law", exceptionCategory: EXCEPTION_CATEGORIES[0] }),
    ).resolves.toBeTruthy();
  });

  it("rejects an unknown outcome and a missing reason", async () => {
    const id = await mkCase("Low");
    await expect(recordErasureOutcome(handler, id, { sourceKey: "db", outcome: "Bogus", reason: "x" })).rejects.toThrow("unknown erasure outcome");
    await expect(recordErasureOutcome(handler, id, { sourceKey: "db", outcome: "Deleted", reason: "  " })).rejects.toThrow("a reason is required");
  });

  it("a handler cannot record an outcome on a high-risk case", async () => {
    const id = await mkCase("High");
    await expect(recordErasureOutcome(handler, id, { sourceKey: "db", outcome: "Deleted", reason: "deleted" })).rejects.toThrow("High-risk erasure outcomes need an approver");
    await expect(recordErasureOutcome(approver, id, { sourceKey: "db", outcome: "Deleted", reason: "deleted" })).resolves.toBeTruthy();
  });

  it("treats a cross-tenant case as unknown", async () => {
    await expect(recordErasureOutcome(handler, otherCaseId, { sourceKey: "db", outcome: "Deleted", reason: "nope" })).rejects.toThrow("unknown case");
    expect(await getErasureOutcomes(handler, otherCaseId)).toBeNull();
  });
});

describe("getErasureOutcomes", () => {
  it("returns the systems and counts by outcome", async () => {
    const id = await mkCase("Low");
    await recordErasureOutcome(handler, id, { sourceKey: "db", outcome: "Deleted", reason: "deleted" });
    const view = await getErasureOutcomes(handler, id);
    expect(view!.systems).toHaveLength(2);
    expect(view!.counts.Deleted).toBe(1);
    expect(view!.counts["Action required"]).toBe(0);
  });
});
