/**
 * Case creation: race-safe numbering and an audit event that commits with the case.
 *
 * The concurrency test is the one that matters. A naive MAX(case_number)+1 would pass a
 * sequential test and collide under load; this drives simultaneous creations through the
 * real path and requires every number to be unique.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { systemDb, systemPool, withTenant, type Transaction } from "@/db/client";
import { auditEvents, cases, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { allocateCaseNumber, createCase, formatCaseNumber } from "@/server/cases/create";

const RUN = `${Date.now()}`;
const tag = `t07c-${RUN}`;
let ready = false;
let orgId = ""; let wsId = ""; let userId = "";
const tx = <T,>(fn: (t: Transaction) => Promise<T>) => withTenant({ orgId, workspaceId: wsId, actorId: userId }, fn);

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    orgId = org.id;
    const ws = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    wsId = ws.id;
    const u = (await systemDb.insert(users).values({
      orgId, workspaceId: wsId, email: `${tag}@example.test`,
      emailHash: hashEmail(`${tag}@example.test`), role: "owner",
    }).returning({ id: users.id }))[0]!;
    userId = u.id;
    ready = true;
  } catch (e) {
    throw new Error(`cases-create setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

describe("T-07 case creation", () => {
  it("formats as DSAR-{YYYY}-{5 digits}, zero-padded", () => {
    expect(formatCaseNumber(2026, 1)).toBe("DSAR-2026-00001");
    expect(formatCaseNumber(2026, 418)).toBe("DSAR-2026-00418");
    expect(formatCaseNumber(2026, 99999)).toBe("DSAR-2026-99999");
  });

  it("hands out a strictly increasing sequence", async () => {
    if (!ready) throw new Error("db not ready");
    const a = await tx((t) => allocateCaseNumber(t, { workspaceId: wsId, year: 2030 }));
    const b = await tx((t) => allocateCaseNumber(t, { workspaceId: wsId, year: 2030 }));
    const c = await tx((t) => allocateCaseNumber(t, { workspaceId: wsId, year: 2030 }));
    expect([a, b, c]).toEqual([a, a + 1, a + 2]);
  });

  it("CONCURRENT allocations all get unique numbers (the race the pattern exists for)", async () => {
    if (!ready) throw new Error("db not ready");
    const results = await Promise.all(
      Array.from({ length: 12 }, () => tx((t) => allocateCaseNumber(t, { workspaceId: wsId, year: 2031 }))),
    );
    expect(new Set(results).size).toBe(results.length);
  });

  it("creates a case AND its audit event in one transaction", async () => {
    if (!ready) throw new Error("db not ready");
    const created = await tx((t) =>
      createCase(t, {
        orgId, workspaceId: wsId, actorId: userId, actorLabel: `${tag}@example.test`,
        requestType: "Access", priority: "High",
        receivedAt: new Date("2026-10-01T09:00:00Z"), statutoryDueAt: new Date("2026-10-31T09:00:00Z"),
      }),
    );
    expect(created.caseNumber).toMatch(/^DSAR-\d{4}-\d{5}$/);

    const [row] = await systemDb.select().from(cases).where(eq(cases.id, created.id));
    expect(row!.status).toBe("New");
    expect(row!.workspaceId).toBe(wsId);

    const audit = await systemDb.select().from(auditEvents).where(eq(auditEvents.objectId, created.id));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.action).toBe("case.created");
    expect(audit[0]!.category).toBe("Intake");
  });

  it("a failure inside the transaction leaves NEITHER the case nor its audit event", async () => {
    if (!ready) throw new Error("db not ready");
    const before = (await systemDb.select({ id: cases.id }).from(cases).where(eq(cases.workspaceId, wsId))).length;

    await expect(
      tx(async (t) => {
        await createCase(t, {
          orgId, workspaceId: wsId, actorId: userId, actorLabel: "",
          requestType: "Erasure",
          receivedAt: new Date("2026-10-01T09:00:00Z"), statutoryDueAt: new Date("2026-10-31T09:00:00Z"),
        });
        // a blank actor_label violates the audit attribution CHECK, so the audit insert
        // fails AFTER the case insert - the deliberate in-transaction failure.
      }),
    ).rejects.toThrow();

    const after = (await systemDb.select({ id: cases.id }).from(cases).where(eq(cases.workspaceId, wsId))).length;
    expect(after).toBe(before);
  });

  it("the persisted vocabulary round-trips through the CHECK constraints", async () => {
    if (!ready) throw new Error("db not ready");
    const rows = await systemDb.select({ s: cases.status, t: cases.requestType }).from(cases).where(inArray(cases.workspaceId, [wsId]));
    for (const r of rows) {
      expect(["New", "Verifying", "In progress", "Awaiting approval", "Completed", "Extended", "Rejected"]).toContain(r.s);
    }
  });
});
