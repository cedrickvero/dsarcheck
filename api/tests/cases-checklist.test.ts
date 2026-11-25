/**
 * The checklist server read and the status transition, against the real database: the rows
 * join the owner, the transition enforces its guards (evidence for Completed, exception
 * category for Retained, a reason always), writes one audit row per change, and a
 * cross-tenant system is invisible (RLS) - indistinguishable from an unknown one.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { auditEvents, cases, caseSystems, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { EXCEPTION_CATEGORIES, listCaseSystems, updateSystemStatus } from "@/server/cases/checklist";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t08chk-${RUN}`;

let orgId = ""; let wsId = ""; let otherWsId = "";
let userId = ""; let caseId = ""; let otherCaseId = "";
let actor: Actor;

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    orgId = org.id;
    const ws = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    wsId = ws.id;
    const otherWs = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-other-ws` }).returning({ id: workspaces.id }))[0]!;
    otherWsId = otherWs.id;

    const u = (await systemDb.insert(users).values({
      orgId, workspaceId: wsId, email: `${tag}@example.test`, emailHash: hashEmail(`${tag}@example.test`), name: "Priya Shah", role: "request_handler",
    }).returning({ id: users.id }))[0]!;
    userId = u.id;
    actor = { userId, orgId, workspaceId: wsId, roles: ["request_handler"], label: `${tag}@example.test`, mfaSatisfied: true };

    const mkCase = async (ws: string, n: string) =>
      (await systemDb.insert(cases).values({
        orgId, workspaceId: ws, caseNumber: n, requestType: "Access", status: "In progress", priority: "Normal",
        receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"),
      }).returning({ id: cases.id }))[0]!.id;
    caseId = await mkCase(wsId, `DSAR-2026-${String(10000 + Math.floor(Math.random() * 89999)).padStart(5, "0")}`);
    otherCaseId = await mkCase(otherWsId, `DSAR-2026-${String(10000 + Math.floor(Math.random() * 89999)).padStart(5, "0")}`);

    await systemDb.insert(caseSystems).values([
      { orgId, workspaceId: wsId, caseId, sourceKey: "db", name: "Production database", status: "Not started", evidenceCount: 0, searchMethod: "Export by email or customer ID", dueAt: new Date("2026-10-20T00:00:00Z"), ownerId: userId },
      { orgId, workspaceId: wsId, caseId, sourceKey: "zendesk", name: "Zendesk", status: "In progress", evidenceCount: 2, searchMethod: "Search tickets by name" },
      { orgId, workspaceId: otherWsId, caseId: otherCaseId, sourceKey: "db", name: "Other tenant DB", status: "Not started", evidenceCount: 0 },
    ]);
  } catch (e) {
    throw new Error(`checklist suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

describe("listCaseSystems", () => {
  it("returns the case's systems ordered by source key, with the owner joined", async () => {
    const rows = await listCaseSystems(actor, caseId);
    expect(rows.map((r) => r.sourceKey)).toEqual(["db", "zendesk"]);
    expect(rows[0]!.ownerName).toBe("Priya Shah");
    expect(rows[0]!.searchMethod).toBe("Export by email or customer ID");
    expect(rows[1]!.ownerName).toBeNull();
  });
});

describe("updateSystemStatus", () => {
  it("changes the status, stores the reason, and writes one audit row", async () => {
    const updated = await updateSystemStatus(actor, caseId, { sourceKey: "db", status: "In progress", reason: "started the export" });
    expect(updated.status).toBe("In progress");
    expect(updated.reason).toBe("started the export");

    const [ev] = await systemDb.select().from(auditEvents).where(and(eq(auditEvents.objectId, caseId), eq(auditEvents.category, "Checklist")));
    expect(ev).toBeDefined();
    expect(ev!.action).toContain("Production database");
    expect(ev!.action).toContain("In progress");
    expect(ev!.reason).toBe("started the export");
  });

  it("refuses Completed without evidence", async () => {
    await expect(
      updateSystemStatus(actor, caseId, { sourceKey: "db", status: "Completed", reason: "done" }),
    ).rejects.toThrow("Attach evidence before marking this system Completed.");
  });

  it("allows Completed once evidence exists", async () => {
    const updated = await updateSystemStatus(actor, caseId, { sourceKey: "zendesk", status: "Completed", reason: "tickets exported and attached" });
    expect(updated.status).toBe("Completed");
  });

  it("refuses Retained under exception without a category", async () => {
    await expect(
      updateSystemStatus(actor, caseId, { sourceKey: "db", status: "Retained under exception", reason: "legal hold" }),
    ).rejects.toThrow("an exception category is required");
  });

  it("stores the exception category and reason for Retained under exception", async () => {
    const updated = await updateSystemStatus(actor, caseId, {
      sourceKey: "db", status: "Retained under exception", reason: "invoices kept under tax law",
      exceptionCategory: EXCEPTION_CATEGORIES[0],
    });
    expect(updated.status).toBe("Retained under exception");
    expect(updated.exceptionCategory).toBe(EXCEPTION_CATEGORIES[0]);
  });

  it("requires a reason for every change", async () => {
    await expect(updateSystemStatus(actor, caseId, { sourceKey: "db", status: "In progress", reason: "  " })).rejects.toThrow("a reason is required");
  });

  it("treats a cross-tenant system as unknown (RLS hides it)", async () => {
    await expect(
      updateSystemStatus(actor, otherCaseId, { sourceKey: "db", status: "In progress", reason: "should not work" }),
    ).rejects.toThrow("unknown system");
    expect(await listCaseSystems(actor, otherCaseId)).toEqual([]);
  });
});
