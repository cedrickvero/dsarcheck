/**
 * Cockpit server reads, against the real database: the audit listing is case-scoped and
 * newest-first with RLS hiding cross-tenant rows, and the overview's checklist progress
 * derives from the checklist rows (and a cross-tenant case number is null, not an error).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemDb, systemPool } from "@/db/client";
import { auditEvents, cases, caseSystems, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { listCaseAuditEvents } from "@/server/cases/audit";
import { getCaseOverview } from "@/server/cases/overview";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t08cockpit-${RUN}`;

let orgId = ""; let wsId = ""; let otherWsId = "";
let userId = ""; let caseId = ""; let otherCaseId = "";
let actor: Actor;
const NUM = `DSAR-2026-${String(10000 + (Math.floor(Math.random() * 89999))).padStart(5, "0")}`;
const ONUM = `DSAR-2026-${String(10000 + (Math.floor(Math.random() * 89999))).padStart(5, "0")}`;

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    orgId = org.id;
    const ws = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    wsId = ws.id;
    const otherWs = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-other-ws` }).returning({ id: workspaces.id }))[0]!;
    otherWsId = otherWs.id;

    const u = (await systemDb.insert(users).values({
      orgId, workspaceId: wsId, email: `${tag}@example.test`, emailHash: hashEmail(`${tag}@example.test`), role: "request_handler",
    }).returning({ id: users.id }))[0]!;
    userId = u.id;
    actor = { userId, orgId, workspaceId: wsId, roles: ["request_handler"], label: `${tag}@example.test`, mfaSatisfied: true };

    const mkCase = async (ws: string, n: string) =>
      (await systemDb.insert(cases).values({
        orgId, workspaceId: ws, caseNumber: n, requestType: "Access", status: "In progress", priority: "Normal",
        receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"),
        requesterName: "Maya Lindqvist", requesterEmail: "maya@example.test",
        details: "I want a copy of everything you hold on me.", identifier: "cust-8821",
      }).returning({ id: cases.id }))[0]!.id;
    caseId = await mkCase(wsId, NUM);
    otherCaseId = await mkCase(otherWsId, ONUM);
  } catch (e) {
    throw new Error(`cockpit suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

describe("listCaseAuditEvents", () => {
  it("lists a case's events newest-first, and RLS hides a cross-tenant row with the same id", async () => {
    const t1 = new Date("2026-10-01T10:00:00Z");
    const t2 = new Date("2026-10-02T10:00:00Z");
    await systemDb.insert(auditEvents).values([
      { orgId, workspaceId: wsId, at: t1, actorId: userId, actorLabel: "priya", action: "case.created", category: "cases", reason: "intake", objectType: "case", objectId: caseId },
      { orgId, workspaceId: wsId, at: t2, actorId: userId, actorLabel: "priya", action: "case.assigned", category: "cases", reason: "assign owner", objectType: "case", objectId: caseId },
      // Cross-tenant row for the SAME objectId: RLS must hide it.
      { orgId, workspaceId: otherWsId, at: t2, actorId: "other", actorLabel: "outsider", action: "case.tampered", category: "cases", reason: "x", objectType: "case", objectId: caseId },
    ]);

    const rows = await listCaseAuditEvents(actor, caseId);
    expect(rows.map((r) => r.action)).toEqual(["case.assigned", "case.created"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.reason).toBe("assign owner");
    expect(rows.every((r) => r.actorLabel !== "outsider")).toBe(true);
  });

  it("returns nothing for a case that has no events", async () => {
    expect(await listCaseAuditEvents(actor, otherCaseId)).toEqual([]);
  });
});

describe("getCaseOverview", () => {
  it("derives the checklist progress from the checklist rows", async () => {
    await systemDb.insert(caseSystems).values([
      { orgId, workspaceId: wsId, caseId, sourceKey: "a", name: "Production database", status: "Completed" },
      { orgId, workspaceId: wsId, caseId, sourceKey: "b", name: "Email archive", status: "Not started" },
      { orgId, workspaceId: wsId, caseId, sourceKey: "c", name: "CRM", status: "Retained under exception" },
    ]);

    const ov = await getCaseOverview(actor, NUM);
    expect(ov).not.toBeNull();
    expect(ov!.systemsDone).toBe(2);
    expect(ov!.systemsTotal).toBe(3);
    expect(ov!.case.details).toBe("I want a copy of everything you hold on me.");
    expect(ov!.case.identifier).toBe("cust-8821");
  });

  it("returns null for a cross-tenant case number, indistinguishable from a missing one", async () => {
    expect(await getCaseOverview(actor, ONUM)).toBeNull();
    expect(await getCaseOverview(actor, "DSAR-2026-00000")).toBeNull();
  });
});
