/**
 * Agency dashboard, against the real database: an agency owner sees every client workspace's
 * stats via the memberships model; a direct-org user (and an agency non-owner) get null, so
 * the page falls through to the direct dashboard. The memberships table is org-scoped RLS.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemDb, systemPool } from "@/db/client";
import { cases, caseSystems, memberships, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { getAgencyDashboard } from "@/server/cases/agency";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t11ag-${RUN}`;

let agencyOrgId = ""; let agencyRootWsId = ""; let kestoWsId = ""; let fernwoodWsId = "";
let directOrgId = ""; let directWsId = "";
let maraId = ""; let handlerId = ""; let directOwnerId = "";
let mara: Actor; let agencyHandler: Actor; let directOwner: Actor; let wsAdmin: Actor;

const num = () => `DSAR-2026-${String(10000 + Math.floor(Math.random() * 89999)).padStart(5, "0")}`;

beforeAll(async () => {
  try {
    const agencyOrg = (await systemDb.insert(orgs).values({ name: `${tag}-agency`, kind: "agency" }).returning({ id: orgs.id }))[0]!;
    agencyOrgId = agencyOrg.id;
    agencyRootWsId = (await systemDb.insert(workspaces).values({ orgId: agencyOrgId, name: `${tag}-root` }).returning({ id: workspaces.id }))[0]!.id;
    kestoWsId = (await systemDb.insert(workspaces).values({ orgId: agencyOrgId, name: "Kesto Health" }).returning({ id: workspaces.id }))[0]!.id;
    fernwoodWsId = (await systemDb.insert(workspaces).values({ orgId: agencyOrgId, name: "Fernwood & Co" }).returning({ id: workspaces.id }))[0]!.id;

    const mkUser = async (orgId: string, wsId: string, role: "owner" | "request_handler" | "workspace_admin", label: string) =>
      (await systemDb.insert(users).values({
        orgId, workspaceId: wsId, email: `${tag}-${label}@example.test`, emailHash: hashEmail(`${tag}-${label}@example.test`), role,
      }).returning({ id: users.id }))[0]!.id;
    maraId = await mkUser(agencyOrgId, agencyRootWsId, "owner", "mara");
    handlerId = await mkUser(agencyOrgId, agencyRootWsId, "request_handler", "handler");

    mara = { userId: maraId, orgId: agencyOrgId, workspaceId: agencyRootWsId, roles: ["owner"], label: `${tag}-mara`, mfaSatisfied: true };
    agencyHandler = { userId: handlerId, orgId: agencyOrgId, workspaceId: agencyRootWsId, roles: ["request_handler"], label: `${tag}-handler`, mfaSatisfied: true };

    // A workspace_admin who is a member of only ONE client (Kesto) — must not see Fernwood.
    const wsAdminId = await mkUser(agencyOrgId, agencyRootWsId, "workspace_admin", "wsadmin");
    await systemDb.insert(memberships).values([
      { orgId: agencyOrgId, userId: wsAdminId, workspaceId: kestoWsId, workspaceName: "Kesto Health", role: "workspace_admin" },
    ]);
    wsAdmin = { userId: wsAdminId, orgId: agencyOrgId, workspaceId: agencyRootWsId, roles: ["workspace_admin"], label: `${tag}-wsadmin`, mfaSatisfied: true };

    await systemDb.insert(memberships).values([
      { orgId: agencyOrgId, userId: maraId, workspaceId: kestoWsId, workspaceName: "Kesto Health", role: "owner" },
      { orgId: agencyOrgId, userId: maraId, workspaceId: fernwoodWsId, workspaceName: "Fernwood & Co", role: "owner" },
    ]);

    // A couple of cases per client: Kesto awaiting approval; Fernwood one open + one high-risk.
    const kestoCase = (await systemDb.insert(cases).values({
      orgId: agencyOrgId, workspaceId: kestoWsId, caseNumber: num(), requestType: "Access", status: "Awaiting approval", priority: "Normal",
      receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"), ownerId: maraId,
    }).returning({ id: cases.id }))[0]!.id;
    await systemDb.insert(caseSystems).values([{ orgId: agencyOrgId, workspaceId: kestoWsId, caseId: kestoCase, sourceKey: "pg", name: "Production database", status: "Completed" }]);

    const fernwoodCase = (await systemDb.insert(cases).values({
      orgId: agencyOrgId, workspaceId: fernwoodWsId, caseNumber: num(), requestType: "Access", status: "In progress", priority: "Normal",
      receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"), ownerId: maraId,
    }).returning({ id: cases.id }))[0]!.id;
    await systemDb.insert(caseSystems).values([{ orgId: agencyOrgId, workspaceId: fernwoodWsId, caseId: fernwoodCase, sourceKey: "mixpanel", name: "Mixpanel", status: "Action required" }]);

    await systemDb.insert(cases).values({
      orgId: agencyOrgId, workspaceId: fernwoodWsId, caseNumber: num(), requestType: "Erasure", status: "Verifying", priority: "Normal",
      receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"), risk: "High",
    });

    // A direct org for the negative cases.
    directOrgId = (await systemDb.insert(orgs).values({ name: `${tag}-direct`, kind: "direct" }).returning({ id: orgs.id }))[0]!.id;
    directWsId = (await systemDb.insert(workspaces).values({ orgId: directOrgId, name: `${tag}-direct-ws` }).returning({ id: workspaces.id }))[0]!.id;
    directOwnerId = await mkUser(directOrgId, directWsId, "owner", "priya");
    directOwner = { userId: directOwnerId, orgId: directOrgId, workspaceId: directWsId, roles: ["owner"], label: `${tag}-priya`, mfaSatisfied: true };
  } catch (e) {
    throw new Error(`agency suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

describe("getAgencyDashboard", () => {
  it("an agency owner sees every client workspace with per-client stats", async () => {
    const dash = await getAgencyDashboard(mara);
    expect(dash).not.toBeNull();
    expect(dash!.clients.map((c) => c.name)).toEqual(["Fernwood & Co", "Kesto Health"]);
    expect(dash!.totalOpen).toBe(3);
    expect(dash!.awaitingApproval).toBe(1);
    expect(dash!.actionRequired).toBe(1);
    expect(dash!.highRisk).toBe(1);

    const fernwood = dash!.clients.find((c) => c.name === "Fernwood & Co")!;
    expect(fernwood.open).toBe(2);
    expect(fernwood.actionRequired).toBe(1);
    expect(fernwood.highRisk).toBe(1);
  });

  it("returns null for a direct-org user", async () => {
    expect(await getAgencyDashboard(directOwner)).toBeNull();
  });

  it("returns null for an agency org non-owner", async () => {
    expect(await getAgencyDashboard(agencyHandler)).toBeNull();
  });

  it("scopes the client list to the actor's own memberships", async () => {
    const dash = await getAgencyDashboard(wsAdmin);
    expect(dash).not.toBeNull();
    expect(dash!.clients.map((c) => c.name)).toEqual(["Kesto Health"]);
  });
});
