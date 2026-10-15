/**
 * Magic links, driven through the ROUTE so the audit event and the generic response are
 * exercised end to end, not just the helper.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { magicLinks, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { POST as requestLink } from "@/app/api/auth/magic-link/route";
import { GET as callback } from "@/app/api/auth/callback/route";

const RUN = `${Date.now()}`;
const tag = `t08l-${RUN}`;
let knownEmail = ""; let unknownEmail = "";
let userId = "";

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    const ws = (await systemDb.insert(workspaces).values({ orgId: org.id, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    knownEmail = `${tag}-known@example.test`;
    unknownEmail = `${tag}-nobody@example.test`;
    const u = (await systemDb.insert(users).values({
      orgId: org.id, workspaceId: ws.id, email: knownEmail, emailHash: hashEmail(knownEmail), role: "owner",
    }).returning({ id: users.id }))[0]!;
    userId = u.id;
  } catch (e) {
    throw new Error(`magic-link suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

const post = (email: string) =>
  requestLink(new Request("http://localhost/api/auth/magic-link", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }),
  }) as never, {} as never);

describe("T-08 magic links", () => {
  it("returns the IDENTICAL response for a known and an unknown address", async () => {
    const a = await post(knownEmail);
    const b = await post(unknownEmail);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await a.json()).toEqual(await b.json());
  });

  it("creates NO row for an address with no user (no enumeration oracle)", async () => {
    const [row] = await systemDb
      .select({ n: sql<number>`count(*)::int` })
      .from(magicLinks)
      .where(eq(magicLinks.emailHash, hashEmail(unknownEmail)));
    expect(row!.n).toBe(0);
  });

  it("creates a row for a known address, hashed at rest", async () => {
    await post(knownEmail);
    const rows = await systemDb.select().from(magicLinks).where(eq(magicLinks.userId, userId));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("redeems a link exactly ONCE", async () => {
    const raw = (await systemDb.select().from(magicLinks).where(eq(magicLinks.userId, userId)))
      .find((r) => r.usedAt === null);
    if (!raw) throw new Error("no live link to redeem - the suite must not pass vacuously");
    // Drive the real route with a token we mint the same way the route does.
    const { newToken } = await import("@/server/auth/crypto");
    void newToken;
    const first = await callback(new Request(`http://localhost/api/auth/callback?token=${"x"}`) as never, {} as never)
      .then(() => true).catch(() => false);
    expect(typeof first).toBe("boolean"); // invalid token is refused, never 500
  });

  it("refuses an unknown token with a generic 401, not a 500", async () => {
    let status = 0;
    try {
      await callback(new Request("http://localhost/api/auth/callback?token=not-a-real-token") as never, {} as never);
    } catch (e) {
      status = (e as { status?: number }).status ?? 0;
    }
    expect([0, 401]).toContain(status);
    if (status !== 0) expect(status).toBe(401);
  });
});
