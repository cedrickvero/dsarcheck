/**
 * The identity read and decision, against the real database: the decision record is derived
 * from the audit log, approve/reject/request-info each move the case per docs/05, a
 * high-risk case needs an approver, and a cross-tenant case is unknown (RLS).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { auditEvents, cases, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { getIdentity, recordIdentityDecision } from "@/server/cases/identity";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t08id-${RUN}`;

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
      orgId, workspaceId: otherWsId, caseNumber: num(), requestType: "Access", status: "New", priority: "Normal",
      receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"), risk: "Low",
    }).returning({ id: cases.id }))[0]!.id;
  } catch (e) {
    throw new Error(`identity suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

const mkCase = async (risk: "Low" | "High", status: "New" | "Verifying" = "New") =>
  (await systemDb.insert(cases).values({
    orgId, workspaceId: wsId, caseNumber: num(), requestType: "Access", status, priority: "Normal",
    receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"), risk,
  }).returning({ id: cases.id }))[0]!.id;

describe("recordIdentityDecision", () => {
  it("approve moves the case to In progress and the decision is the audit row", async () => {
    const id = await mkCase("Low");
    const result = await recordIdentityDecision(handler, id, { decision: "approve", reason: "email and ID match" });
    expect(result.status).toBe("In progress");
    expect(result.identityVerified).toBe(true);

    const identity = await getIdentity(handler, id);
    expect(identity!.identityVerified).toBe(true);
    expect(identity!.decision?.decision).toBe("approve");
    expect(identity!.decision?.reason).toBe("email and ID match");
    expect(identity!.decision?.by).toBe(handler.label);
  });

  it("reject closes the case", async () => {
    const id = await mkCase("Low");
    const result = await recordIdentityDecision(handler, id, { decision: "reject", reason: "not the account holder" });
    expect(result.status).toBe("Rejected");
    const [row] = await systemDb.select({ closedAt: cases.closedAt }).from(cases).where(eq(cases.id, id));
    expect(row!.closedAt).not.toBeNull();
  });

  it("requesting information keeps the case verifying and records what is needed", async () => {
    const id = await mkCase("Low", "Verifying");
    await recordIdentityDecision(handler, id, { decision: "request_info", reason: "need proof of address", infoOption: "Proof of address" });
    const identity = await getIdentity(handler, id);
    expect(identity!.infoRequested).toBe(true);
    expect(identity!.decision?.decision).toBe("request_info");
    expect(identity!.decision?.infoOption).toBe("Proof of address");
  });

  it("a handler cannot approve or reject a high-risk case", async () => {
    const id = await mkCase("High", "Verifying");
    await expect(recordIdentityDecision(handler, id, { decision: "approve", reason: "matches" })).rejects.toThrow("High-risk identity needs an approver");
    await expect(recordIdentityDecision(handler, id, { decision: "reject", reason: "not the holder" })).rejects.toThrow("High-risk identity needs an approver");
    // but may request more information
    await expect(recordIdentityDecision(handler, id, { decision: "request_info", reason: "need more" })).resolves.toBeTruthy();
  });

  it("an approver may approve a high-risk case", async () => {
    const id = await mkCase("High");
    const result = await recordIdentityDecision(approver, id, { decision: "approve", reason: "verified in person" });
    expect(result.status).toBe("In progress");
  });

  it("requires a reason", async () => {
    const id = await mkCase("Low");
    await expect(recordIdentityDecision(handler, id, { decision: "approve", reason: "  " })).rejects.toThrow("a reason is required");
  });

  it("rejects an unknown decision value", async () => {
    const id = await mkCase("Low");
    await expect(recordIdentityDecision(handler, id, { decision: "bogus" as "approve", reason: "reason" })).rejects.toThrow("unknown identity decision");
  });

  it("can only request information while verifying", async () => {
    const id = await mkCase("Low"); // New
    await expect(recordIdentityDecision(handler, id, { decision: "request_info", reason: "need more" })).rejects.toThrow("information can only be requested while verifying");
  });

  it("refuses a second decision once the case has moved on", async () => {
    const id = await mkCase("Low");
    await recordIdentityDecision(handler, id, { decision: "approve", reason: "verified" });
    await expect(recordIdentityDecision(handler, id, { decision: "reject", reason: "changed my mind" })).rejects.toThrow("identity has already been decided");
  });

  it("derives the decision from the audit action, never a non-decision Identity event", async () => {
    const id = await mkCase("Low");
    // A future non-decision Identity event (e.g. opening an ID document) carries no
    // decision, and must NOT be mislabeled as a decision - the filter + action map exist
    // exactly for this.
    await systemDb.insert(auditEvents).values({
      orgId, workspaceId: wsId, at: new Date(), actorId: handlerId, actorLabel: handler.label,
      action: "Identity document opened", category: "Identity", reason: "viewed",
      objectType: "case", objectId: id,
    });
    const identity = await getIdentity(handler, id);
    expect(identity!.decision).toBeNull();
  });

  it("treats a cross-tenant case as unknown", async () => {
    await expect(recordIdentityDecision(handler, otherCaseId, { decision: "approve", reason: "nope" })).rejects.toThrow("unknown case");
  });
});
