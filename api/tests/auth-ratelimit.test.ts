/** DB-backed rate limiting, hashed buckets, and a cleanup that cannot over-reach. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { pool, systemDb, systemPool, withTenant, type Transaction } from "@/db/client";
import { orgs, rateLimitHits, sessions, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { bucketKey, cleanupExpiredHits, enforceRateLimit } from "@/server/auth/rate-limit";

const RUN = `${Date.now()}`;
const tag = `t08r-${RUN}`;
let orgId = ""; let wsId = ""; let userId = "";
const appTx = <T,>(fn: (tx: Transaction) => Promise<T>) => withTenant({ orgId, workspaceId: wsId, actorId: userId }, fn);

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
    throw new Error(`ratelimit suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

describe("T-08 rate limiting", () => {
  it("enforces the limit, and the hit rows are DURABLE (DB-backed, not in-memory)", async () => {
    const key = bucketKey(["ratelimit-probe", tag]);
    for (let i = 0; i < 3; i += 1) {
      await appTx((tx) => enforceRateLimit(tx, { bucketKey: key, scope: "totp_verify", limit: 3, windowSeconds: 3600, workspaceId: wsId }));
    }
    await expect(
      appTx((tx) => enforceRateLimit(tx, { bucketKey: key, scope: "totp_verify", limit: 3, windowSeconds: 3600, workspaceId: wsId })),
    ).rejects.toThrow(/too many attempts/i);

    // Durable: read them back through a different connection, the way a restarted
    // process would. Deliberately the admin pool - these rows carry a workspace, so an
    // untenanted application read is hidden by RLS (which the tenant suite covers).
    const { rows } = await systemPool.query<{ n: number }>(
      "select count(*)::int as n from rate_limit_hits where bucket_key = $1 and scope = $2",
      [key, "totp_verify"],
    );
    expect(rows[0]!.n).toBe(3);
  });

  it("stores a HASH, never the raw identifier", async () => {
    const email = `${tag}-hashprobe@example.test`;
    const key = bucketKey([hashEmail(email)]);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("@");
    await appTx((tx) => enforceRateLimit(tx, { bucketKey: key, scope: "magic_link_request", limit: 5, windowSeconds: 3600, workspaceId: null }));
    const { rows } = await pool.query<{ bucket_key: string }>(
      "select bucket_key from rate_limit_hits where bucket_key = $1", [key],
    );
    expect(rows[0]!.bucket_key).not.toContain(email);
  });

  it("cleanup deletes ONLY expired rows - a live row must survive", async () => {
    const expiredKey = bucketKey(["expired-probe", tag]);
    const liveKey = bucketKey(["live-probe", tag]);
    await appTx(async (tx) => {
      await tx.insert(rateLimitHits).values({ bucketKey: expiredKey, scope: "totp_verify", expiresAt: new Date(Date.now() - 60_000) });
      await tx.insert(rateLimitHits).values({ bucketKey: liveKey, scope: "totp_verify", expiresAt: new Date(Date.now() + 600_000) });
    });

    await cleanupExpiredHits();

    const { rows } = await pool.query<{ bucket_key: string }>(
      "select bucket_key from rate_limit_hits where bucket_key in ($1, $2)", [expiredKey, liveKey],
    );
    const keys = rows.map((r) => r.bucket_key);
    expect(keys).not.toContain(expiredKey);
    expect(keys).toContain(liveKey);
  });

  it("the app role still holds no DELETE on the table - cleanup goes through the function", async () => {
    await expect(pool.query("delete from rate_limit_hits where bucket_key = $1", [bucketKey(["x"])]))
      .rejects.toThrow(/permission denied/i);
  });

  it("an unknown scope is still counted, so a typo cannot silently disable throttling", async () => {
    const key = bucketKey(["scope-probe", tag]);
    await appTx((tx) => enforceRateLimit(tx, { bucketKey: key, scope: "totp_verify", limit: 1, windowSeconds: 3600, workspaceId: wsId }));
    await expect(appTx((tx) => enforceRateLimit(tx, { bucketKey: key, scope: "totp_verify", limit: 1, windowSeconds: 3600, workspaceId: wsId })))
      .rejects.toThrow();
  });
});
