/** Sessions: opaque at rest, expiring, revocable, rotated on privilege change. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { systemDb, systemPool, withLookup } from "@/db/client";
import { orgs, sessions, users, workspaces } from "@/db/schema";
import { hashEmail, hashToken } from "@/server/auth/crypto";
import { createSession, resolveSession, revokeSession, rotateOnPrivilegeChange } from "@/server/auth/session-store";
import { withTenant, type Transaction } from "@/db/client";

const RUN = `${Date.now()}`;
let orgId = ""; let wsId = ""; let userId = "";
const tag = `t08s-${RUN}`;

function appTx<T>(fn: (tx: Transaction) => Promise<T>) {
  return withTenant({ orgId, workspaceId: wsId, actorId: userId }, fn);
}

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    orgId = org.id;
    const ws = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    wsId = ws.id;
    const u = (await systemDb.insert(users).values({
      orgId, workspaceId: wsId, email: `${tag}@example.test`, emailHash: hashEmail(`${tag}@example.test`), role: "owner",
    }).returning({ id: users.id }))[0]!;
    userId = u.id;
  } catch (e) {
    throw new Error(`session suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

describe("T-08 sessions", () => {
  it("stores only a HASH: the token itself is never in the database", async () => {
    const { token } = await appTx((tx) => createSession(tx, { userId, orgId, workspaceId: wsId }));
    const [row] = await systemDb.select({ h: sessions.tokenHash }).from(sessions).where(eq(sessions.userId, userId));
    expect(row!.h).not.toBe(token);
    expect(row!.h).toBe(hashToken(token));
    expect(row!.h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("resolves a live token, and refuses an expired one", async () => {
    const { token, sessionId } = await appTx((tx) => createSession(tx, { userId, orgId, workspaceId: wsId }));
    const live = await withLookup({ sessionTokenHash: hashToken(token) }, (tx) => resolveSession(tx, token));
    expect(live?.user.id).toBe(userId);

    await systemDb.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, sessionId));
    const dead = await withLookup({ sessionTokenHash: hashToken(token) }, (tx) => resolveSession(tx, token));
    expect(dead).toBeNull();
  });

  it("refuses an idle-expired session, and one that has been revoked", async () => {
    const idle = await appTx((tx) => createSession(tx, { userId, orgId, workspaceId: wsId }));
    await systemDb.update(sessions).set({ lastSeenAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30) }).where(eq(sessions.id, idle.sessionId));
    expect(await withLookup({ sessionTokenHash: hashToken(idle.token) }, (tx) => resolveSession(tx, idle.token))).toBeNull();

    const doomed = await appTx((tx) => createSession(tx, { userId, orgId, workspaceId: wsId }));
    await appTx((tx) => revokeSession(tx, doomed.sessionId));
    expect(await withLookup({ sessionTokenHash: hashToken(doomed.token) }, (tx) => resolveSession(tx, doomed.token))).toBeNull();
  });

  it("a privilege change invalidates every session issued under the old epoch", async () => {
    const before = await appTx((tx) => createSession(tx, { userId, orgId, workspaceId: wsId }));
    expect(await withLookup({ sessionTokenHash: hashToken(before.token) }, (tx) => resolveSession(tx, before.token))).not.toBeNull();
    const epoch = await appTx((tx) => rotateOnPrivilegeChange(tx, userId));
    expect(epoch).toBeGreaterThan(0);
    expect(await withLookup({ sessionTokenHash: hashToken(before.token) }, (tx) => resolveSession(tx, before.token))).toBeNull();
  });
});
