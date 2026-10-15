/**
 * The two CRITICAL fixes, proven end to end through the ROUTES.
 *
 * CRITICAL-1: magic-link redemption was impossible - the redemption UPDATE matched 0
 * rows because the token policy was FOR SELECT only.
 * CRITICAL-2: MFA was a deadlock - requireAuth refused an MFA-outstanding session, but
 * the TOTP routes needed exactly that session to be reachable.
 *
 * The previous single-use test was VACUOUS (it fed token "x" and asserted only that a
 * boolean came back). These are not.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { magicLinks, mfaTotp, orgs, sessions, users, workspaces } from "@/db/schema";
import { hashEmail, hashToken, newToken } from "@/server/auth/crypto";
import { codeForStep, currentStep } from "@/server/auth/totp";
import { GET as callback } from "@/app/api/auth/callback/route";
import { POST as totpEnrol } from "@/app/api/auth/totp/enrol/route";
import { POST as totpVerify } from "@/app/api/auth/totp/verify/route";
import { POST as signOut } from "@/app/api/auth/sign-out/route";

const RUN = `${Date.now()}`;
const tag = `t08mfa-${RUN}`;
let orgId = ""; let wsId = ""; let userId = ""; let ownerEmail = "";
let mfaOutstanding = "";

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    orgId = org.id;
    const ws = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    wsId = ws.id;
    ownerEmail = `${tag}-owner@example.test`;
    const u = (await systemDb.insert(users).values({
      orgId, workspaceId: wsId, email: ownerEmail, emailHash: hashEmail(ownerEmail), role: "owner",
    }).returning({ id: users.id }))[0]!;
    userId = u.id;

    // An MFA-OUTSTANDING session for an owner, exactly the state CRITICAL-2 deadlocked.
    const token = newToken();
    await systemDb.insert(sessions).values({
      orgId, workspaceId: wsId, userId, tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    mfaOutstanding = token;
  } catch (e) {
    throw new Error(`mfa-step suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

const withCookie = (token: string, body?: unknown) =>
  new Request("http://localhost/api/auth/totp/enrol", {
    method: "POST",
    headers: { cookie: `dsar_session=${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never;

describe("T-08 CRITICAL-2 - the MFA step is reachable by an MFA-outstanding session", () => {
  it("an MFA-outstanding owner CAN enrol (this was a deadlock)", async () => {
    const res = await totpEnrol(withCookie(mfaOutstanding), {} as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { otpauthUri?: string };
    expect(body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
  });

  it("that session can then VERIFY, and only then does a normal route open", async () => {
    const [row] = await systemDb.select().from(mfaTotp).where(eq(mfaTotp.userId, userId));
    if (!row) throw new Error("no enrolment row - the suite must not pass vacuously");
    const { decryptSecret } = await import("@/server/auth/crypto");
    const secret = decryptSecret({ ciphertext: row.secretCiphertext, iv: row.secretIv, tag: row.secretTag });

    // Before verification a normal route refuses the session.
    let before = 0;
    try {
      const r = await signOut(withCookie(mfaOutstanding), {} as never);
      before = r.status;
    } catch (e) {
      before = (e as { status?: number }).status ?? 0;
    }
    expect(before).toBe(401);

    const res = await totpVerify(
      withCookie(mfaOutstanding, { code: codeForStep(secret, currentStep()) }),
      {} as never,
    );
    expect(res.status).toBe(200);

    const [after] = await systemDb.select({ at: sessions.mfaSatisfiedAt }).from(sessions).where(eq(sessions.tokenHash, hashToken(mfaOutstanding)));
    expect(after!.at).not.toBeNull();
  });

  it("NOTHING but a verified code can set the MFA flag", async () => {
    const token = newToken();
    await systemDb.insert(sessions).values({
      orgId, workspaceId: wsId, userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000),
    });
    const res = await totpVerify(withCookie(token, { code: "000000" }), {} as never);
    expect(res.status).toBe(401);
    const [row] = await systemDb.select({ at: sessions.mfaSatisfiedAt }).from(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    expect(row!.at).toBeNull();
  });

  it("the partial gate is used by the TOTP routes and NOTHING else", () => {
    // The narrowness of requireAuthForMfaStep is the whole reason CRITICAL-2's fix is
    // safe, so it is enforced mechanically rather than by comment.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (["node_modules", ".next", "graphify-out"].includes(entry)) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(full)) {
          const body = readFileSync(full, "utf8");
          if (body.includes("requireAuthForMfaStep") && !/totp\/(enrol|verify)\/route\.ts$/.test(full) && !full.endsWith("require-auth.ts")) {
            offenders.push(full);
          }
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});

describe("T-08 CRITICAL-1 - a magic link actually redeems", () => {
  it("redeems end to end through the route, sets a session cookie, and refuses the second attempt", async () => {
    const token = newToken();
    await systemDb.insert(magicLinks).values({
      orgId, workspaceId: wsId, userId, emailHash: hashEmail(ownerEmail),
      tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 900_000),
    });

    const first = await callback(new Request(`http://localhost/api/auth/callback?token=${token}`) as never, {} as never);
    expect(first.status).toBe(200);
    const cookie = first.headers.get("set-cookie");
    if (!cookie) throw new Error("no session cookie was set - redemption did not complete");
    const issued = /(?:__Host-)?dsar_session=([^;]+)/.exec(cookie)![1]!;
    expect(issued.length).toBeGreaterThan(20);

    // The issued cookie must correspond to a real session row.
    const [sess] = await systemDb.select({ id: sessions.id }).from(sessions).where(eq(sessions.tokenHash, hashToken(decodeURIComponent(issued))));
    expect(sess).toBeDefined();

    // And the link is used up.
    const [link] = await systemDb.select({ usedAt: magicLinks.usedAt }).from(magicLinks).where(eq(magicLinks.tokenHash, hashToken(token)));
    expect(link!.usedAt).not.toBeNull();

    let second = 0;
    try {
      const r = await callback(new Request(`http://localhost/api/auth/callback?token=${token}`) as never, {} as never);
      second = r.status;
    } catch (e) {
      second = (e as { status?: number }).status ?? 0;
    }
    expect(second).toBe(401);
  });

  it("SINGLE USE holds under CONCURRENCY - simultaneous redemptions, exactly one wins", async () => {
    // A brand-new token, so this asserts concurrency and not the state left by earlier tests.
    const token = newToken();
    await systemDb.insert(magicLinks).values({
      orgId, workspaceId: wsId, userId, emailHash: hashEmail(ownerEmail),
      tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 900_000),
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        callback(new Request(`http://localhost/api/auth/callback?token=${token}`) as never, {} as never)
          .then((r) => r.status)
          .catch((e) => (e as { status?: number }).status ?? 0),
      ),
    );
    const successes = results.filter((s) => s === 200);
    expect(successes).toHaveLength(1);
  });
});
