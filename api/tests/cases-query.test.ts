/**
 * Case reads: tenant isolation and role gating, through the APPLICATION pool (never
 * systemDb, whose superuser bypasses RLS and would prove nothing).
 *
 * The cross-tenant case is the important one: it must be indistinguishable from a case
 * that does not exist, because a distinguishable failure confirms the case exists
 * elsewhere.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemDb, systemPool } from "@/db/client";
import { cases, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import type { Actor } from "@/server/auth/require-auth";
import { getCaseByNumber, listCases } from "@/server/cases/query";

const RUN = `${Date.now()}`;
const tag = `t07q-${RUN}`;
let ready = false;
let actorA: Actor; let actorB: Actor; let handlerA: Actor;

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    const wsA = (await systemDb.insert(workspaces).values({ orgId: org.id, name: `${tag}-A` }).returning({ id: workspaces.id }))[0]!;
    const wsB = (await systemDb.insert(workspaces).values({ orgId: org.id, name: `${tag}-B` }).returning({ id: workspaces.id }))[0]!;
    const mk = async (ws: string, role: string, n: string) =>
      (await systemDb.insert(users).values({
        orgId: org.id, workspaceId: ws, email: `${n}-${tag}@example.test`,
        emailHash: hashEmail(`${n}-${tag}@example.test`), role: role as "owner",
      }).returning({ id: users.id }))[0]!;
    const ua = await mk(wsA.id, "owner", "a");
    const ub = await mk(wsB.id, "owner", "b");
    const uh = await mk(wsA.id, "system_owner", "h");
    await systemDb.insert(cases).values([
      { orgId: org.id, workspaceId: wsA.id, caseNumber: `DSAR-2026-00001`, requestType: "Access", priority: "High", status: "In progress", receivedAt: new Date("2026-10-01T09:00:00Z"), statutoryDueAt: new Date("2026-10-31T09:00:00Z") },
      { orgId: org.id, workspaceId: wsB.id, caseNumber: `DSAR-2026-00002`, requestType: "Erasure", priority: "Normal", status: "New", receivedAt: new Date("2026-10-02T09:00:00Z"), statutoryDueAt: new Date("2026-11-01T09:00:00Z") },
    ]);
    actorA = { userId: ua.id, label: "A", orgId: org.id, workspaceId: wsA.id, roles: ["owner"] };
    actorB = { userId: ub.id, label: "B", orgId: org.id, workspaceId: wsB.id, roles: ["owner"] };
    handlerA = { userId: uh.id, label: "H", orgId: org.id, workspaceId: wsA.id, roles: ["system_owner"] };
    ready = true;
  } catch (e) {
    throw new Error(`cases-query setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

describe("T-07 case reads", () => {
  it("the list contains ONLY the actor's workspace", async () => {
    if (!ready) throw new Error("db not ready");
    const rows = await listCases(actorA);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.workspaceId === actorA.workspaceId)).toBe(true);
    expect(rows.some((r) => r.caseNumber === "DSAR-2026-00002")).toBe(false);
  });

  it("a CROSS-TENANT case number is indistinguishable from a missing one (null, not 403)", async () => {
    if (!ready) throw new Error("db not ready");
    expect(await getCaseByNumber(actorA, "DSAR-2026-00002")).toBeNull(); // exists, other tenant
    expect(await getCaseByNumber(actorA, "DSAR-2026-99999")).toBeNull(); // does not exist
  });

  it("a MALFORMED case number is also null, so 400 cannot leak existence", async () => {
    if (!ready) throw new Error("db not ready");
    for (const bad of ["nonsense", "DSAR-26-1", "DSAR-2026-1", "../../etc", ""]) {
      expect(await getCaseByNumber(actorA, bad)).toBeNull();
    }
  });

  it("the actor CAN read its own case", async () => {
    if (!ready) throw new Error("db not ready");
    const row = await getCaseByNumber(actorA, "DSAR-2026-00001");
    expect(row?.caseNumber).toBe("DSAR-2026-00001");
    expect(row?.workspaceId).toBe(actorA.workspaceId);
  });

  it("a role without view permission is REFUSED (403), not shown an empty list", async () => {
    if (!ready) throw new Error("db not ready");
    const weird: Actor = { ...actorA, roles: ["approver"] };
    // approver DOES have view_and_update_cases in the docs/01 matrix, so use a role that
    // does not exist in the matrix at all rather than assert a false premise.
    const noPerm = { ...actorA, roles: ["nonexistent_role" as "owner"] };
    await expect(listCases(noPerm)).rejects.toThrow(/does not permit viewing cases/i);
    void weird;
  });

  it("an authorized non-owner role CAN read (matrix, not a hard-coded owner check)", async () => {
    if (!ready) throw new Error("db not ready");
    const rows = await listCases(handlerA);
    expect(rows.every((r) => r.workspaceId === handlerA.workspaceId)).toBe(true);
  });
});
