import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { systemDb, systemPool, withTenant } from "@/db/client";
import { auditEvents, orgs, workspaces } from "@/db/schema";
import { mutate } from "@/server/db/mutate";

/**
 * R1 integration tests. These run against a REAL Postgres because the claims
 * under test - RLS tenant isolation and the append-only trigger - are database
 * behaviours. A mocked systemPool would prove nothing.
 *
 * Setup runs as the systemPool user (a dev superuser, which bypasses RLS); every
 * assertion that matters runs through withTenant(), i.e. as `app_tenant`.
 */
const suite = process.env.DATABASE_URL ? describe : describe.skip;

interface CountRow { n: number }
interface NameRow { name: string }
interface WsRow { workspace_id: string }

/**
 * Drizzle wraps driver errors, so the Postgres message lives on `cause`.
 * Assert against both rather than the wrapper.
 */
async function expectRejectsWith(p: Promise<unknown>, re: RegExp): Promise<void> {
  let caught: unknown;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(caught, "expected the query to reject").toBeDefined();
  const err = caught as { message?: string; cause?: { message?: string } };
  const text = `${err.message ?? ""} ${err.cause?.message ?? ""}`;
  expect(text).toMatch(re);
}

suite("R1 tenant isolation + append-only audit", () => {
  let orgA = "";
  let orgB = "";
  let wsA = "";
  let wsB = "";
  const who = { userId: randomUUID(), label: "r1-test" };

  beforeAll(async () => {
    const [a] = await systemDb.insert(orgs).values({ name: "R1 Org A" }).returning();
    const [b] = await systemDb.insert(orgs).values({ name: "R1 Org B" }).returning();
    orgA = a!.id;
    orgB = b!.id;
    const [wa] = await systemDb.insert(workspaces).values({ orgId: orgA, name: "R1 WS A" }).returning();
    const [wb] = await systemDb.insert(workspaces).values({ orgId: orgB, name: "R1 WS B" }).returning();
    wsA = wa!.id;
    wsB = wb!.id;
    await systemDb.insert(auditEvents).values([
      { orgId: orgA, workspaceId: wsA, actorId: who.userId, actorLabel: who.label,
        action: "seed", category: "test", reason: "seed A", objectType: "case" },
      { orgId: orgB, workspaceId: wsB, actorId: who.userId, actorLabel: who.label,
        action: "seed", category: "test", reason: "seed B", objectType: "case" },
    ]);
  });

  afterAll(async () => {
    // Best-effort cleanup of the fixtures this suite creates. audit_events is
    // append-only by design, so its rows are intentionally left behind.
    await systemPool.end();
  });

  it("fails closed: with no tenant GUC set, zero rows are visible", async () => {
    const r = await systemDb.transaction(async (tx) => {
      await tx.execute(sql`set local role app_tenant`);
      return tx.execute(sql`select count(*)::int as n from audit_events`);
    });
    expect((r.rows[0] as unknown as CountRow).n).toBe(0);
  });

  it("cross-tenant reads fail", async () => {
    const seen = await withTenant(
      { orgId: orgA, workspaceId: wsA, actorId: who.userId },
      async (tx) => {
        const r = await tx.execute(sql`select workspace_id from audit_events`);
        return (r.rows as unknown as WsRow[]).map((x) => x.workspace_id);
      },
    );
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen)).toEqual(new Set([wsA]));
    expect(seen).not.toContain(wsB);
  });

  it("cross-tenant writes fail", async () => {
    await expect(
      withTenant({ orgId: orgA, workspaceId: wsA, actorId: who.userId }, async (tx) => {
        await tx.execute(sql`insert into audit_events
          (org_id, workspace_id, actor_id, actor_label, action, category, reason, object_type)
          values (${orgB}, ${wsB}, 'attacker', 'attacker', 'cross', 'test', 'cross-tenant write', 'case')`);
      }),
    ).rejects.toThrow();
  });

  it("a change and its audit event commit in the SAME transaction", async () => {
    // Unique per run: audit rows are append-only, so a shared marker would
    // accumulate across runs and make this assertion order-dependent.
    const marker = `commit-${randomUUID()}`;
    await withTenant({ orgId: orgA, workspaceId: wsA, actorId: who.userId }, async (tx) => {
      await tx.execute(sql`update workspaces set name = ${marker} where id = ${wsA}`);
      await tx.execute(sql`insert into audit_events
        (org_id, workspace_id, actor_id, actor_label, action, category, reason, object_type, object_id)
        values (${orgA}, ${wsA}, ${who.userId}, ${who.label}, 'commit-test', 'workspace', 'rename test', 'workspace', ${marker})`);
    });
    const n = await systemDb.execute(sql`select count(*)::int as n from audit_events where object_id = ${marker}`);
    const w = await systemDb.execute(sql`select name from workspaces where id = ${wsA}`);
    expect((n.rows[0] as unknown as CountRow).n).toBe(1);
    expect((w.rows[0] as unknown as NameRow).name).toBe(marker);
  });

  it("a change and its audit event ROLL BACK together", async () => {
    const before = await systemDb.execute(sql`select count(*)::int as n from audit_events`);
    await expect(
      withTenant({ orgId: orgA, workspaceId: wsA, actorId: who.userId }, async (tx) => {
        await tx.execute(sql`update workspaces set name = 'must-not-persist' where id = ${wsA}`);
        await tx.execute(sql`insert into audit_events
          (org_id, workspace_id, actor_id, actor_label, action, category, reason, object_type)
          values (${orgA}, ${wsA}, ${who.userId}, ${who.label}, 'rollback-test', 'workspace', 'rollback test', 'workspace')`);
        throw new Error("deliberate failure after the audit insert");
      }),
    ).rejects.toThrow("deliberate failure");
    const after = await systemDb.execute(sql`select count(*)::int as n from audit_events`);
    const w = await systemDb.execute(sql`select name from workspaces where id = ${wsA}`);
    expect((after.rows[0] as unknown as CountRow).n).toBe((before.rows[0] as unknown as CountRow).n);
    expect((w.rows[0] as unknown as NameRow).name).not.toBe("must-not-persist");
  });

  it("audit rows cannot be updated", async () => {
    await expectRejectsWith(
      systemDb.execute(sql`update audit_events set reason = 'tampered'`),
      /append-only/i,
    );
  });

  it("audit rows cannot be deleted", async () => {
    await expectRejectsWith(systemDb.execute(sql`delete from audit_events`), /append-only/i);
  });

  it("mutate() fails LOUDLY when authorization is missing", async () => {
    await expect(
      mutate(
        { action: "case.close", reason: "closing after verification", objectType: "case", schema: z.object({}), input: {} },
        async () => "unreachable",
      ),
    ).rejects.toThrow(/not implemented/i);
  });

  it("mutate() rejects a missing reason before touching the database", async () => {
    await expect(
      mutate(
        { action: "case.close", reason: "", objectType: "case", schema: z.object({}), input: {} },
        async () => "unreachable",
      ),
    ).rejects.toThrow();
  });
});
