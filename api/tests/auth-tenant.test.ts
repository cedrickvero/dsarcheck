/**
 * Tenant resolution and the pre-auth lookup boundary (closes O3).
 *
 * Every assertion runs through the APPLICATION pool, never systemDb: the admin user is
 * a superuser and bypasses RLS, so a check written against it would prove nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemDb, systemPool, withLookup, withTenant } from "@/db/client";
import { objects, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import type { Actor } from "@/server/auth/require-auth";
import { workspaceForActor } from "@/server/tenancy/tenant";

const RUN = `${Date.now()}`;
let ready = false;
let wsA = "";
let wsB = "";
let actorA: Actor;
let actorB: Actor;

beforeAll(async () => {
  try {
    const tag = `t08t-${RUN}`;
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    const a = (await systemDb.insert(workspaces).values({ orgId: org.id, name: `${tag}-A` }).returning({ id: workspaces.id }))[0]!;
    const b = (await systemDb.insert(workspaces).values({ orgId: org.id, name: `${tag}-B` }).returning({ id: workspaces.id }))[0]!;
    wsA = a.id;
    wsB = b.id;
    const ua = (await systemDb.insert(users).values({
      orgId: org.id, workspaceId: wsA, email: `a-${tag}@example.test`,
      emailHash: hashEmail(`a-${tag}@example.test`), role: "owner",
    }).returning({ id: users.id }))[0]!;
    const ub = (await systemDb.insert(users).values({
      orgId: org.id, workspaceId: wsB, email: `b-${tag}@example.test`,
      emailHash: hashEmail(`b-${tag}@example.test`), role: "request_handler",
    }).returning({ id: users.id }))[0]!;
    actorA = { userId: ua.id, label: `a-${tag}@example.test`, orgId: org.id, workspaceId: wsA, roles: ["owner"] };
    actorB = { userId: ub.id, label: `b-${tag}@example.test`, orgId: org.id, workspaceId: wsB, roles: ["request_handler"] };
    await systemDb.insert(objects).values({
      orgId: org.id, workspaceId: wsA, objectKey: `ws/${wsA}/evidence/00000000-0000-4000-8000-000000000001`,
      purpose: "evidence", contentType: "application/pdf", uploaderActorId: ua.id,
    });
    ready = true;
  } catch (e) {
    throw new Error(`tenant suite setup failed - the suite must NOT pass silently: ${String(e)}`);
  }
});

afterAll(async () => { await systemPool.end().catch(() => {}); });

describe("T-08 tenant resolution and the pre-auth lookup boundary", () => {
  it("an email-hash lookup reveals exactly that user, and no other", async () => {
    if (!ready) throw new Error("db not ready");
    const rows = await withLookup({ emailHash: hashEmail(actorB.label) }, async (tx) =>
      tx.select({ id: users.id, ws: users.workspaceId }).from(users),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(actorB.userId);
    expect(rows[0]!.ws).toBe(wsB);
  });

  it("an email-hash lookup cannot see a TENANT-ONLY table at all", async () => {
    if (!ready) throw new Error("db not ready");
    // objects carries only a tenant policy, so a credential lookup must reveal nothing.
    const rows = await withLookup({ emailHash: hashEmail(actorA.label) }, async (tx) =>
      tx.select({ id: objects.id }).from(objects),
    );
    expect(rows).toHaveLength(0);
  });

  it("no tenant and no credential means every table is empty - it fails CLOSED", async () => {
    if (!ready) throw new Error("db not ready");
    const rows = await withLookup({}, async (tx) => tx.select({ id: users.id }).from(users));
    expect(rows).toHaveLength(0);
  });

  it("a tenant-scoped read sees its own workspace and not the other", async () => {
    if (!ready) throw new Error("db not ready");
    const asA = await withTenant(
      { orgId: actorA.orgId, workspaceId: wsA, actorId: actorA.userId },
      async (tx) => tx.select({ id: users.id, ws: users.workspaceId }).from(users),
    );
    expect(asA.every((r) => r.ws === wsA)).toBe(true);
    expect(asA.some((r) => r.id === actorB.userId)).toBe(false);

    const asB = await withTenant(
      { orgId: actorB.orgId, workspaceId: wsB, actorId: actorB.userId },
      async (tx) => tx.select({ id: users.id }).from(users),
    );
    expect(asB.some((r) => r.id === actorA.userId)).toBe(false);
  });

  it("a caller-supplied workspace is refused when it disagrees with the session", () => {
    expect(() => workspaceForActor(actorA, wsB)).toThrow(/does not match the authenticated session/i);
    expect(workspaceForActor(actorA, wsA)).toBe(wsA);
    expect(workspaceForActor(actorA)).toBe(wsA);
  });
});
