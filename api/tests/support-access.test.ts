/**
 * G5 — customer-side support-access approval (docs/05 § Admin rules, non-negotiable #4).
 * Drives the server functions against the real database: a Platform-admin request becomes
 * a Requested grant the owner approves (Active, 24h) or declines; an active grant can be
 * ended; expiry is lazy; everything is owner-gated and audited; a cross-tenant grant is
 * unknown (RLS).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { auditEvents, orgs, supportGrants, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import {
  approveSupportAccess,
  declineSupportAccess,
  endSupportAccess,
  listSupportGrants,
} from "@/server/workspace/support";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t15sa-${RUN}`;

let orgId = ""; let wsId = ""; let otherWsId = ""; let ownerId = ""; let handlerId = "";
let owner: Actor; let handler: Actor;

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    orgId = org.id;
    const ws = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    wsId = ws.id;
    const otherWs = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-other-ws` }).returning({ id: workspaces.id }))[0]!;
    otherWsId = otherWs.id;
    const mkUser = async (role: "owner" | "request_handler") =>
      (await systemDb.insert(users).values({
        orgId, workspaceId: wsId, email: `${tag}-${role}@example.test`, emailHash: hashEmail(`${tag}-${role}@example.test`), role,
      }).returning({ id: users.id }))[0]!.id;
    ownerId = await mkUser("owner");
    handlerId = await mkUser("request_handler");
    owner = { userId: ownerId, orgId, workspaceId: wsId, roles: ["owner"], label: `${tag}-owner@example.test`, mfaSatisfied: true };
    handler = { userId: handlerId, orgId, workspaceId: wsId, roles: ["request_handler"], label: `${tag}-request_handler@example.test`, mfaSatisfied: true };
  } catch (e) {
    throw new Error(`support-access suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

async function mkGrant(workspaceId: string) {
  const [row] = await systemDb
    .insert(supportGrants)
    .values({
      orgId,
      workspaceId,
      staffLabel: "Privacyspace Support",
      scope: "investigate an error",
      reason: "the requester reported an export failure",
      status: "Requested",
    })
    .returning({ id: supportGrants.id });
  return row!.id;
}

async function readGrant(id: string) {
  const [row] = await systemDb
    .select({ status: supportGrants.status, expiresAt: supportGrants.expiresAt, declineReason: supportGrants.declineReason })
    .from(supportGrants)
    .where(eq(supportGrants.id, id));
  return row!;
}

describe("support access", () => {
  it("an owner approves a request and it becomes active with a 24h expiry", async () => {
    const grantId = await mkGrant(wsId);
    const before = Date.now();
    await approveSupportAccess(owner, grantId, "we need the help");
    const row = await readGrant(grantId);
    expect(row.status).toBe("Active");
    expect(row.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 23 * 60 * 60 * 1000);
    expect(row.expiresAt!.getTime()).toBeLessThanOrEqual(before + 25 * 60 * 60 * 1000);

    const [audit] = await systemDb
      .select({ action: auditEvents.action, category: auditEvents.category })
      .from(auditEvents)
      .where(and(eq(auditEvents.objectId, grantId), eq(auditEvents.action, "Support access approved")));
    expect(audit!.action).toBe("Support access approved");
    expect(audit!.category).toBe("Access");
  });

  it("an owner declines a request with a recorded reason", async () => {
    const grantId = await mkGrant(wsId);
    await declineSupportAccess(owner, grantId, "not needed right now");
    const row = await readGrant(grantId);
    expect(row.status).toBe("Declined");
    expect(row.declineReason).toBe("not needed right now");
  });

  it("an owner ends an active grant early", async () => {
    const grantId = await mkGrant(wsId);
    await approveSupportAccess(owner, grantId, "go ahead");
    await endSupportAccess(owner, grantId, "issue resolved");
    const row = await readGrant(grantId);
    expect(row.status).toBe("Ended");
  });

  it("lists the pending and active grants for the owner", async () => {
    const a = await mkGrant(wsId);
    const b = await mkGrant(wsId);
    await approveSupportAccess(owner, a, "okay");
    const list = await listSupportGrants(owner);
    const statuses = list.map((g) => g.status);
    expect(statuses).toContain("Active");
    expect(statuses).toContain("Requested");
    const bGrant = list.find((g) => g.id === b);
    expect(bGrant?.status).toBe("Requested");
  });

  it("lazily expires an active grant past its expiry", async () => {
    const grantId = await mkGrant(wsId);
    await approveSupportAccess(owner, grantId, "okay");
    await systemDb
      .update(supportGrants)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(supportGrants.id, grantId));
    const list = await listSupportGrants(owner);
    expect(list.find((g) => g.id === grantId)?.status).toBe("Expired");
  });
});

describe("support access guards", () => {
  it("a non-owner cannot list, approve, decline or end", async () => {
    const grantId = await mkGrant(wsId);
    await expect(listSupportGrants(handler)).rejects.toThrow("Only an owner");
    await expect(approveSupportAccess(handler, grantId, "nope")).rejects.toThrow("Only an owner");
    await expect(declineSupportAccess(handler, grantId, "nope")).rejects.toThrow("Only an owner");
    await expect(endSupportAccess(handler, grantId, "nope")).rejects.toThrow("Only an owner");
  });

  it("refuses to approve or decline a grant that is not requested", async () => {
    const grantId = await mkGrant(wsId);
    await approveSupportAccess(owner, grantId, "okay");
    await expect(approveSupportAccess(owner, grantId, "again")).rejects.toThrow("only a requested grant");
    await expect(declineSupportAccess(owner, grantId, "later")).rejects.toThrow("only a requested grant");
  });

  it("refuses to end a grant that is not active", async () => {
    const grantId = await mkGrant(wsId);
    await expect(endSupportAccess(owner, grantId, "not active yet")).rejects.toThrow("only an active grant");
  });

  it("cannot end a grant that has silently expired", async () => {
    const grantId = await mkGrant(wsId);
    await approveSupportAccess(owner, grantId, "go ahead");
    await systemDb
      .update(supportGrants)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(supportGrants.id, grantId));
    await expect(endSupportAccess(owner, grantId, "close it out")).rejects.toThrow("only an active grant");
  });

  it("requires a reason", async () => {
    const grantId = await mkGrant(wsId);
    await expect(approveSupportAccess(owner, grantId, "ab")).rejects.toThrow("reason is required");
    await expect(declineSupportAccess(owner, grantId, "ab")).rejects.toThrow("reason is required");
    await expect(endSupportAccess(owner, grantId, "ab")).rejects.toThrow("reason is required");
  });

  it("a cross-tenant grant is unknown to approve and end (RLS)", async () => {
    const otherGrantId = await mkGrant(otherWsId);
    await expect(approveSupportAccess(owner, otherGrantId, "snoop")).rejects.toThrow("unknown support grant");
    await expect(endSupportAccess(owner, otherGrantId, "snoop")).rejects.toThrow("unknown support grant");
  });
});
