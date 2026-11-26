/**
 * Magic links, driven through the ROUTE so the audit event and the generic response are
 * exercised end to end, not just the helper.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { magicLinks, orgs, rateLimitHits, sessions, users, workspaces } from "@/db/schema";
import { hashEmail, hashToken, newToken } from "@/server/auth/crypto";
import { bucketKey } from "@/server/auth/rate-limit";
import { POST as requestLink } from "@/app/api/auth/magic-link/route";
import { GET as callback } from "@/app/api/auth/callback/route";

const RUN = `${Date.now()}`;
const tag = `t08l-${RUN}`;
let knownEmail = ""; let unknownEmail = "";
let userId = ""; let orgId = ""; let wsId = "";
// Fixtures must be unique per run (the tag carries Date.now): the hash bucket is shared by
// everything that normalises to the same address, and a fixed email would collide with the
// PREVIOUS run's row and turn every lookup into an ambiguous one.
let caseUserId = ""; const caseEmail = `Case.${tag}@example.test`; const caseEmailNormalised = caseEmail.toLowerCase();
const ambiguousEmail = `${tag}-amb@example.test`;
const bogusToken = `${tag}-not-a-real-token`;

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    orgId = org.id;
    const ws = (await systemDb.insert(workspaces).values({ orgId: org.id, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    wsId = ws.id;
    knownEmail = `${tag}-known@example.test`;
    unknownEmail = `${tag}-nobody@example.test`;
    const u = (await systemDb.insert(users).values({
      orgId: org.id, workspaceId: ws.id, email: knownEmail, emailHash: hashEmail(knownEmail), role: "owner",
    }).returning({ id: users.id }))[0]!;
    userId = u.id;

    // LOW-2 fixture: a user whose STORED email differs in case from its normalised form. The
    // hash bucket is case-insensitive, so the lookup must resolve by hash, not by raw text.
    const caseUser = (await systemDb.insert(users).values({
      orgId: org.id, workspaceId: ws.id, email: caseEmail, emailHash: hashEmail(caseEmailNormalised), role: "owner",
    }).returning({ id: users.id }))[0]!;
    caseUserId = caseUser.id;

    // Two users whose emails differ only in case: one hash bucket, two rows -> ambiguous.
    await systemDb.insert(users).values({
      orgId: org.id, workspaceId: ws.id, email: ambiguousEmail, emailHash: hashEmail(ambiguousEmail), role: "owner",
    });
    await systemDb.insert(users).values({
      orgId: org.id, workspaceId: ws.id, email: ambiguousEmail.toUpperCase(), emailHash: hashEmail(ambiguousEmail), role: "request_handler",
    });
  } catch (e) {
    throw new Error(`magic-link suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

/**
 * Drive the callback and normalise the two ways it can refuse: a Response, or an AppError
 * thrown by the route handler. A thrown error with no status is a 500, so a crash can never
 * be mistaken for a refusal.
 */
async function hit(token: string): Promise<{ status: number; cookie: string | null }> {
  try {
    const res = await callback(
      new Request(`http://localhost/api/auth/callback?token=${encodeURIComponent(token)}`) as never,
      {} as never,
    );
    return { status: res.status, cookie: res.headers.get("set-cookie") };
  } catch (e) {
    return { status: (e as { status?: number }).status ?? 500, cookie: null };
  }
}

/** A link row for the seeded user, so a redemption test does not depend on SMTP. */
async function mintLink(): Promise<string> {
  const token = newToken();
  await systemDb.insert(magicLinks).values({
    orgId, workspaceId: wsId, userId,
    emailHash: hashEmail(knownEmail),
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });
  return token;
}

async function sessionCount(): Promise<number> {
  const [row] = await systemDb
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(eq(sessions.userId, userId));
  return row!.n;
}

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

  it("a rate-limited request returns the same generic 200, not a 429 (no enumeration oracle)", async () => {
    // Exhaust the magic-link bucket for the known address with durable hits.
    const key = bucketKey([hashEmail(knownEmail)]);
    for (let i = 0; i < 5; i += 1) {
      await systemDb.insert(rateLimitHits).values({
        bucketKey: key, scope: "magic_link_request", workspaceId: null, expiresAt: new Date(Date.now() + 3600_000),
      });
    }
    const throttled = await post(knownEmail);
    const unknown = await post(unknownEmail);
    expect(throttled.status).toBe(200);
    expect(await throttled.json()).toEqual(await unknown.json());
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

  it("refuses an unknown token with a 401 - not a 500, and not by throwing something else", async () => {
    // The previous version of this test accepted status 0 as a pass, so an unrelated crash
    // counted as a refusal. Anything other than exactly 401 now fails.
    const { status } = await hit(bogusToken);
    expect(status).toBe(401);
  });

  it("redeems a link exactly ONCE, and records the redemption", async () => {
    const token = await mintLink();
    const first = await hit(token);
    expect(first.status).toBe(200);
    expect(first.cookie).toContain("dsar_session");

    const replay = await hit(token);
    expect(replay.status).toBe(401);
    expect(replay.cookie).toBeNull();

    // Exactly one row, marked used: the property, not the response code alone.
    const rows = await systemDb
      .select({ usedAt: magicLinks.usedAt })
      .from(magicLinks)
      .where(eq(magicLinks.tokenHash, hashToken(token)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.usedAt).not.toBeNull();
  });

  it("refuses an expired link and leaves it unconsumed", async () => {
    const token = newToken();
    await systemDb.insert(magicLinks).values({
      orgId, workspaceId: wsId, userId,
      emailHash: hashEmail(knownEmail),
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() - 60_000),
    });

    expect((await hit(token)).status).toBe(401);

    const [row] = await systemDb
      .select({ usedAt: magicLinks.usedAt })
      .from(magicLinks)
      .where(eq(magicLinks.tokenHash, hashToken(token)));
    // Refusing must not burn the token: an expired link is refused, not spent.
    expect(row!.usedAt).toBeNull();
  });

  it("does not create a session when redemption is refused", async () => {
    const before = await sessionCount();
    await hit(bogusToken);
    expect(await sessionCount()).toBe(before);
  });

  it("resolves a user by hash, not by the raw stored email casing", async () => {
    // The stored email is "Case.User@example.test" but the request is lower-cased: the old
    // raw-email predicate would have missed this row. It must issue a link anyway.
    await post(caseEmailNormalised);
    const rows = await systemDb.select().from(magicLinks).where(eq(magicLinks.userId, caseUserId));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("refuses an address that is ambiguous by hash, even across casing, without creating a row", async () => {
    // Same normalised email, two rows, differing only in case: the lookup must see BOTH and
    // refuse, rather than pick one at random (which a raw-email filter would do).
    const res = await post(ambiguousEmail);
    expect(res.status).toBe(200); // the generic response either way

    const [row] = await systemDb
      .select({ n: sql<number>`count(*)::int` })
      .from(magicLinks)
      .where(eq(magicLinks.emailHash, hashEmail(ambiguousEmail)));
    expect(row!.n).toBe(0);
  });
});
