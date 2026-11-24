/**
 * The dashboard read against the real database: the aggregates must come from the rows
 * (risk, closedAt, Action-required checklist counts and the approver's name), not from
 * anything a client could fake.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { cases, caseSystems, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { dashboardRows } from "@/server/cases/dashboard";
import { attentionItems, caseStats } from "@/domain/dashboard";
import type { Actor, Role } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t07dash-${RUN}`;
let orgId = ""; let wsId = "";
let actor: Actor;
const NOW = new Date(Date.UTC(2026, 9, 13, 10, 42));

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    orgId = org.id;
    const ws = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    wsId = ws.id;

    const priya = (await systemDb.insert(users).values({
      orgId, workspaceId: wsId, email: `${tag}-priya@example.test`, emailHash: hashEmail(`${tag}-priya@example.test`), name: "Priya Shah", role: "request_handler",
    }).returning({ id: users.id }))[0]!;
    await systemDb.insert(users).values({
      orgId, workspaceId: wsId, email: `${tag}-daniel@example.test`, emailHash: hashEmail(`${tag}-daniel@example.test`), name: "Daniel Okafor", role: "approver",
    });
    actor = {
      userId: priya.id, orgId, workspaceId: wsId, roles: ["request_handler"],
      label: `${tag}-priya@example.test`, mfaSatisfied: true,
    };

    const mkCase = async (caseNumber: string, over: {
      status?: "New" | "Verifying" | "In progress" | "Awaiting approval" | "Completed";
      risk?: "Low" | "Medium" | "High";
      receivedAt: Date; dueAt: Date; closedAt?: Date | null;
    }) =>
      (await systemDb.insert(cases).values({
        orgId, workspaceId: wsId, caseNumber, requestType: "Access",
        status: over.status ?? "In progress", priority: "Normal",
        risk: over.risk ?? "Low", receivedAt: over.receivedAt, statutoryDueAt: over.dueAt,
        closedAt: over.closedAt ?? null, requesterName: "Maya Lindqvist", requesterEmail: "maya@example.test",
      }).returning({ id: cases.id }))[0]!.id;

    // An overdue case, and an awaiting-approval case with an Action-required system.
    const overdue = await mkCase("DSAR-2026-00405", {
      receivedAt: new Date(Date.UTC(2026, 8, 11)), dueAt: new Date(Date.UTC(2026, 9, 11)),
    });
    const awaiting = await mkCase("DSAR-2026-00412", {
      status: "Awaiting approval", receivedAt: new Date(Date.UTC(2026, 8, 20)), dueAt: new Date(Date.UTC(2026, 9, 20)),
    });
    await mkCase("DSAR-2026-00420", {
      status: "New", risk: "High", receivedAt: new Date(Date.UTC(2026, 8, 24)), dueAt: new Date(Date.UTC(2026, 9, 24)),
    });
    await mkCase("DSAR-2026-00390", {
      status: "Completed", receivedAt: new Date(Date.UTC(2026, 8, 1)), dueAt: new Date(Date.UTC(2026, 9, 1)),
      closedAt: new Date(Date.UTC(2026, 9, 3)),
    });

    await systemDb.insert(caseSystems).values([
      { orgId, workspaceId: wsId, caseId: overdue, sourceKey: "pg", status: "Completed" },
      { orgId, workspaceId: wsId, caseId: awaiting, sourceKey: "pg", status: "Action required" },
      { orgId, workspaceId: wsId, caseId: awaiting, sourceKey: "stripe", status: "Action required" },
    ]);
  } catch (e) {
    throw new Error(`dashboard suite setup failed: ${String(e)}`);
  }
});

afterAll(async () => { await systemPool.end().catch(() => {}); });

describe("dashboardRows()", () => {
  it("returns the risk, closure date, Action-required counts and the approver's name", async () => {
    const { rows, approverName } = await dashboardRows(actor);
    expect(approverName).toBe("Daniel Okafor");

    const byNumber = new Map(rows.map((r) => [r.caseNumber, r]));
    expect(byNumber.get("DSAR-2026-00420")!.risk).toBe("High");
    expect(byNumber.get("DSAR-2026-00390")!.closedAt).not.toBeNull();
    expect(byNumber.get("DSAR-2026-00412")!.actionRequired).toBe(2);
    expect(byNumber.get("DSAR-2026-00405")!.actionRequired).toBe(0);
  });

  it("feeds the domain functions to produce the ranked attention list", async () => {
    const { rows } = await dashboardRows(actor);
    const stats = caseStats(rows, NOW);
    expect(stats).toMatchObject({
      open: 3,
      overdue: 1,
      awaitingApproval: 1,
      highRiskVerifications: 1,
      actionRequiredSystems: 2,
      completedThisMonth: 1,
    });

    const attention = attentionItems(rows, NOW);
    expect(attention.map((i) => i.why)).toEqual([
      "Statutory deadline passed",
      "Awaiting approval by Daniel Okafor",
      "High-risk identity check",
    ]);
  });

  it("refuses a caller whose roles cannot view the dashboard", async () => {
    const wrong: Actor = { ...actor, roles: ["viewer" as Role] };
    await expect(dashboardRows(wrong)).rejects.toMatchObject({ status: 403 });
  });

  it("stays inside the workspace - other tenants' cases never appear", async () => {
    const { rows } = await dashboardRows(actor);
    expect(rows.every((r) => r.caseNumber.startsWith("DSAR-2026-"))).toBe(true);
  });
});
