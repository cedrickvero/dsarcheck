/**
 * The case list reads and the two bulk operations, against the real database.
 *
 * The properties under test are the ones a UI cannot prove: the rows are tenant-scoped,
 * the checklist count comes from the checklist rows, and a bulk action either applies to
 * every selected case with an audit row each, or to none of them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { auditEvents, cases, caseSystems, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { bulkAssignOwner, exportCasesCsv } from "@/server/cases/bulk";
import { listCaseListRows } from "@/server/cases/query";
import type { Actor, Role } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t07list-${RUN}`;

let orgId = ""; let wsId = ""; let otherOrgId = ""; let otherWsId = "";
let priyaId = ""; let danielId = ""; let outsiderId = "";
let priya: Actor; let outsider: Actor;

const N418 = "DSAR-2026-00418";
const N405 = "DSAR-2026-00405";
const N398 = "DSAR-2026-00398";
const NOTHER = "DSAR-2026-00999";

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    orgId = org.id;
    const ws = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    wsId = ws.id;
    const other = (await systemDb.insert(orgs).values({ name: `${tag}-other-org` }).returning({ id: orgs.id }))[0]!;
    otherOrgId = other.id;
    const otherWs = (await systemDb.insert(workspaces).values({ orgId: otherOrgId, name: `${tag}-other-ws` }).returning({ id: workspaces.id }))[0]!;
    otherWsId = otherWs.id;

    const mkUser = async (ws: string, org: string, name: string, email: string, role: "request_handler" | "approver") =>
      (await systemDb.insert(users).values({
        orgId: org, workspaceId: ws, email, emailHash: hashEmail(email), name, role,
      }).returning({ id: users.id }))[0]!.id;

    priyaId = await mkUser(wsId, orgId, "Priya Shah", `${tag}-priya@example.test`, "request_handler");
    danielId = await mkUser(wsId, orgId, "Daniel Okafor", `${tag}-daniel@example.test`, "approver");
    outsiderId = await mkUser(otherWsId, otherOrgId, "Outsider", `${tag}-out@example.test`, "request_handler");

    priya = {
      userId: priyaId, orgId, workspaceId: wsId, roles: ["request_handler"],
      label: `${tag}-priya@example.test`, mfaSatisfied: true,
    };
    outsider = {
      userId: outsiderId, orgId: otherOrgId, workspaceId: otherWsId, roles: ["request_handler"],
      label: `${tag}-out@example.test`, mfaSatisfied: true,
    };

    const mkCase = async (ws: string, org: string, caseNumber: string, over: {
      status?: "New" | "In progress" | "Completed"; due: Date; ownerId?: string | null;
    }) =>
      (await systemDb.insert(cases).values({
        orgId: org, workspaceId: ws, caseNumber,
        requestType: "Access", status: over.status ?? "In progress", priority: "Normal",
        receivedAt: new Date(Date.UTC(2026, 8, 24)),
        statutoryDueAt: over.due,
        ownerId: over.ownerId === undefined ? priyaId : over.ownerId,
        requesterName: "Maya Lindqvist", requesterEmail: "maya@example.test",
      }).returning({ id: cases.id }))[0]!.id;

    const id418 = await mkCase(wsId, orgId, N418, { due: new Date(Date.UTC(2026, 9, 24)) });
    const id405 = await mkCase(wsId, orgId, N405, { due: new Date(Date.UTC(2026, 9, 11)), ownerId: null });
    await mkCase(wsId, orgId, N398, { due: new Date(Date.UTC(2026, 9, 1)), status: "Completed" });
    await mkCase(otherWsId, otherOrgId, NOTHER, { due: new Date(Date.UTC(2026, 9, 20)) });

    // 4 of 7 done on 418; 1 of 3 on 405.
    const systems: [string, string, string][] = [
      [id418, "pg", "Completed"], [id418, "stripe", "Completed"], [id418, "hubspot", "Not found"],
      [id418, "zendesk", "Completed"], [id418, "intercom", "In progress"],
      [id418, "mixpanel", "Not started"], [id418, "gws", "Not started"],
      [id405, "pg", "Completed"], [id405, "stripe", "In progress"], [id405, "hubspot", "Not started"],
    ];
    for (const [caseId, sourceKey, status] of systems) {
      await systemDb.insert(caseSystems).values({
        orgId, workspaceId: wsId, caseId, sourceKey, status: status as never,
      });
    }
  } catch (e) {
    throw new Error(`case-list suite setup failed - must not pass silently: ${String(e)}`);
  }
});

afterAll(async () => { await systemPool.end().catch(() => {}); });

describe("listCaseListRows()", () => {
  it("returns the workspace's cases, nearest deadline first", async () => {
    const rows = await listCaseListRows(priya);
    expect(rows.map((r) => r.caseNumber)).toEqual([N398, N405, N418]);
  });

  it("resolves the owner's display name, and leaves an unassigned case null", async () => {
    const rows = await listCaseListRows(priya);
    const byNumber = new Map(rows.map((r) => [r.caseNumber, r]));
    expect(byNumber.get(N418)!.ownerName).toBe("Priya Shah");
    expect(byNumber.get(N405)!.ownerId).toBeNull();
    expect(byNumber.get(N405)!.ownerName).toBeNull();
  });

  it("counts the checklist from the rows, not from a stored total", async () => {
    const rows = await listCaseListRows(priya);
    const byNumber = new Map(rows.map((r) => [r.caseNumber, r]));
    expect(byNumber.get(N418)).toMatchObject({ checklistDone: 4, checklistTotal: 7 });
    expect(byNumber.get(N405)).toMatchObject({ checklistDone: 1, checklistTotal: 3 });
    expect(byNumber.get(N398)).toMatchObject({ checklistDone: 0, checklistTotal: 0 });
  });

  it("never returns another tenant's cases", async () => {
    const rows = await listCaseListRows(priya);
    expect(rows.some((r) => r.caseNumber === NOTHER)).toBe(false);
  });

  it("refuses a caller whose roles cannot view cases", async () => {
    const wrong: Actor = { ...priya, roles: ["viewer" as Role] };
    await expect(listCaseListRows(wrong)).rejects.toMatchObject({ status: 403 });
  });
});

describe("bulkAssignOwner()", () => {
  const auditFor = async (caseNumber: string) => {
    const [row] = await systemDb
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.workspaceId, wsId), eq(cases.caseNumber, caseNumber)));
    return systemDb
      .select({ action: auditEvents.action, reason: auditEvents.reason, actorId: auditEvents.actorId })
      .from(auditEvents)
      .where(eq(auditEvents.objectId, row!.id));
  };

  it("assigns every selected case and writes one audit row each, with the reason", async () => {
    const result = await bulkAssignOwner(priya, {
      caseNumbers: [N418, N405],
      ownerId: danielId,
      reason: "Rebalancing queue for annual leave",
    });
    expect(result).toEqual({ updated: 2, ownerName: "Daniel Okafor" });

    for (const number of [N418, N405]) {
      const [row] = await systemDb.select({ ownerId: cases.ownerId }).from(cases).where(and(eq(cases.workspaceId, wsId), eq(cases.caseNumber, number)));
      expect(row!.ownerId).toBe(danielId);
      const audits = (await auditFor(number)).filter((a) => a.action.startsWith("Owner changed to"));
      expect(audits).toHaveLength(1);
      expect(audits[0]!.reason).toBe("Rebalancing queue for annual leave");
      expect(audits[0]!.actorId).toBe(priyaId);
    }
  });

  it("requires a reason", async () => {
    await expect(
      bulkAssignOwner(priya, { caseNumbers: [N418], ownerId: danielId, reason: "   " }),
    ).rejects.toMatchObject({ status: 422 });
    // and nothing changed
    const [row] = await systemDb.select({ ownerId: cases.ownerId }).from(cases).where(and(eq(cases.workspaceId, wsId), eq(cases.caseNumber, N418)));
    expect(row!.ownerId).toBe(danielId); // still the previous assignment
  });

  it("refuses the whole batch when one case is not in this workspace - and changes nothing", async () => {
    const [before] = await systemDb.select({ ownerId: cases.ownerId }).from(cases).where(and(eq(cases.workspaceId, wsId), eq(cases.caseNumber, N418)));

    await expect(
      bulkAssignOwner(priya, {
        caseNumbers: [N418, NOTHER],
        ownerId: priyaId,
        reason: "cross-tenant probe",
      }),
    ).rejects.toMatchObject({ status: 404 });

    const [after] = await systemDb.select({ ownerId: cases.ownerId }).from(cases).where(and(eq(cases.workspaceId, wsId), eq(cases.caseNumber, N418)));
    expect(after!.ownerId).toBe(before!.ownerId);
  });

  it("refuses an owner who is not a member of this workspace", async () => {
    await expect(
      bulkAssignOwner(priya, { caseNumbers: [N418], ownerId: outsiderId, reason: "not my tenant" }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("refuses a caller whose roles cannot change cases", async () => {
    const wrong: Actor = { ...priya, roles: ["viewer" as Role] };
    await expect(
      bulkAssignOwner(wrong, { caseNumbers: [N418], ownerId: danielId, reason: "nope" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("exportCasesCsv()", () => {
  it("returns a CSV of exactly the selected cases and audits each one", async () => {
    const now = new Date(Date.UTC(2026, 9, 13, 10, 42));
    const result = await exportCasesCsv(priya, {
      caseNumbers: [N418],
      reason: "Requester asked for their file list",
      now,
    });

    const lines = result.csv.trim().split("\r\n");
    expect(lines).toHaveLength(2); // header + one case
    expect(lines[0]).toContain("Case ID,Requester,Email,Type,Status,Owner,Received,Deadline,Days left,Priority");
    expect(lines[1]).toContain(N418);
    expect(result.filename).toBe("cases-2026-10-13.csv");

    const [row] = await systemDb.select({ id: cases.id }).from(cases).where(and(eq(cases.workspaceId, wsId), eq(cases.caseNumber, N418)));
    const audits = await systemDb
      .select({ action: auditEvents.action, reason: auditEvents.reason })
      .from(auditEvents)
      .where(eq(auditEvents.objectId, row!.id));
    const exportAudits = audits.filter((a) => a.action === "Case included in CSV export");
    expect(exportAudits).toHaveLength(1);
    expect(exportAudits[0]!.reason).toBe("Requester asked for their file list");
  });

  it("requires a reason, so an export cannot happen untracked", async () => {
    await expect(
      exportCasesCsv(priya, { caseNumbers: [N418], reason: "", now: new Date() }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("refuses another tenant's case", async () => {
    await expect(
      exportCasesCsv(priya, { caseNumbers: [NOTHER], reason: "cross-tenant probe", now: new Date() }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("counts the new table's policies, so RLS is not silently missing", async () => {
    const [row] = await systemDb.execute(sql`
      select count(*)::int as n from pg_policies where tablename = 'case_systems'
    `).then((r) => (r as unknown as { rows: { n: number }[] }).rows);
    expect(row!.n).toBeGreaterThan(0);
  });
});
