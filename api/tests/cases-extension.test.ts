/**
 * G15 — the deadline-extension flow and its "approver reviews extensions" gate
 * (docs/05 § Extension). Drives the server functions against the real database:
 * an extension applies immediately when the setting is off, lands in a pending
 * sub-state when on (Approver approves/rejects), caps at 2 months, and is audited.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { auditEvents, cases, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { approveExtension, rejectExtension, requestExtension } from "@/server/cases/extension";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t15ext-${RUN}`;

let orgId = ""; let wsId = ""; let handlerId = ""; let approverId = "";
let handler: Actor; let approver: Actor;

const num = () => `DSAR-2026-${String(10000 + Math.floor(Math.random() * 89999)).padStart(5, "0")}`;

async function readCase(id: string) {
  const [row] = await systemDb
    .select({ status: cases.status, extensionMonths: cases.extensionMonths, extensionRequestedMonths: cases.extensionRequestedMonths })
    .from(cases)
    .where(eq(cases.id, id));
  return row!;
}

async function setReviewsExtensions(on: boolean) {
  await systemDb.update(workspaces).set({ approverReviewsExtensions: on }).where(eq(workspaces.id, wsId));
}

async function mkCase(
  status: "New" | "Verifying" | "In progress" | "Awaiting approval" | "Completed" | "Extended" | "Rejected",
  extensionMonths = 0,
) {
  return (
    await systemDb.insert(cases).values({
      orgId, workspaceId: wsId, caseNumber: num(), requestType: "Access", status, priority: "Normal",
      receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"), risk: "Low",
      extensionMonths,
    }).returning({ id: cases.id })
  )[0]!.id;
}

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    orgId = org.id;
    const ws = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws`, approverReviewsExtensions: false }).returning({ id: workspaces.id }))[0]!;
    wsId = ws.id;
    const mkUser = async (role: "request_handler" | "approver") =>
      (await systemDb.insert(users).values({
        orgId, workspaceId: wsId, email: `${tag}-${role}@example.test`, emailHash: hashEmail(`${tag}-${role}@example.test`), role,
      }).returning({ id: users.id }))[0]!.id;
    handlerId = await mkUser("request_handler");
    approverId = await mkUser("approver");
    handler = { userId: handlerId, orgId, workspaceId: wsId, roles: ["request_handler"], label: `${tag}-request_handler@example.test`, mfaSatisfied: true };
    approver = { userId: approverId, orgId, workspaceId: wsId, roles: ["approver"], label: `${tag}-approver@example.test`, mfaSatisfied: true };
  } catch (e) {
    throw new Error(`extension suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

describe("requestExtension (setting off)", () => {
  it("extends the deadline immediately and audits it", async () => {
    await setReviewsExtensions(false);
    const id = await mkCase("In progress");
    const result = await requestExtension(handler, id, 1, "waiting on a third-party processor");
    expect(result.pending).toBe(false);
    const row = await readCase(id);
    expect(row.status).toBe("Extended");
    expect(row.extensionMonths).toBe(1);

    const [audit] = await systemDb
      .select({ action: auditEvents.action, category: auditEvents.category })
      .from(auditEvents)
      .where(and(eq(auditEvents.objectId, id), eq(auditEvents.action, "Extend deadline")));
    expect(audit!.action).toBe("Extend deadline");
    expect(audit!.category).toBe("SLA");
  });

  it("caps the total at 2 months", async () => {
    await setReviewsExtensions(false);
    const id = await mkCase("In progress", 1);
    await expect(requestExtension(handler, id, 2, "need the full two months")).rejects.toThrow("2 months at most");
  });

  it("rejects months outside 1 or 2", async () => {
    const id = await mkCase("In progress");
    await expect(requestExtension(handler, id, 3, "three months")).rejects.toThrow("1 or 2 months");
  });

  it("refuses a closed case", async () => {
    const id = await mkCase("Completed");
    await expect(requestExtension(handler, id, 1, "reopen")).rejects.toThrow("closed case");
  });

  it("requires a reason", async () => {
    const id = await mkCase("In progress");
    await expect(requestExtension(handler, id, 1, "ab")).rejects.toThrow("reason is required");
  });
});

describe("requestExtension (setting on — approver gate)", () => {
  it("lands in a pending sub-state instead of extending", async () => {
    await setReviewsExtensions(true);
    const id = await mkCase("In progress");
    const result = await requestExtension(handler, id, 2, "complex data sources");
    expect(result.pending).toBe(true);
    const row = await readCase(id);
    expect(row.status).toBe("In progress");
    expect(row.extensionMonths).toBe(0);
    expect(row.extensionRequestedMonths).toBe(2);

    const [audit] = await systemDb
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(and(eq(auditEvents.objectId, id), eq(auditEvents.action, "Extension requested")));
    expect(audit!.action).toBe("Extension requested");
  });

  it("the approver approves and the extension applies", async () => {
    await setReviewsExtensions(true);
    const id = await mkCase("In progress");
    await requestExtension(handler, id, 2, "complex data sources");
    await approveExtension(approver, id, "scope is justified");
    const row = await readCase(id);
    expect(row.status).toBe("Extended");
    expect(row.extensionMonths).toBe(2);
    expect(row.extensionRequestedMonths).toBeNull();
  });

  it("the approver rejects and the deadline is unchanged", async () => {
    await setReviewsExtensions(true);
    const id = await mkCase("In progress");
    await requestExtension(handler, id, 1, "backlog");
    await rejectExtension(approver, id, "still on track");
    const row = await readCase(id);
    expect(row.status).toBe("In progress");
    expect(row.extensionMonths).toBe(0);
    expect(row.extensionRequestedMonths).toBeNull();
  });

  it("a handler may not approve or reject", async () => {
    await setReviewsExtensions(true);
    const id = await mkCase("In progress");
    await requestExtension(handler, id, 1, "backlog");
    await expect(approveExtension(handler, id, "nope")).rejects.toThrow("Only an approver");
    await expect(rejectExtension(handler, id, "nope")).rejects.toThrow("Only an approver");
  });

  it("refuses to approve when nothing is pending", async () => {
    await setReviewsExtensions(true);
    const id = await mkCase("In progress");
    await expect(approveExtension(approver, id, "nothing to approve")).rejects.toThrow("no extension is awaiting approval");
  });
});
