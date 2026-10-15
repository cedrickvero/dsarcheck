/** TOTP: encrypted at rest, windowed, replay-proof, and never exposed after enrolment. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { systemDb, systemPool, withTenant, type Transaction } from "@/db/client";
import { auditEvents, mfaTotp, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { beginEnrolment, codeForStep, confirmEnrolment, currentStep, verifyCode, verifyForUser } from "@/server/auth/totp";

const RUN = `${Date.now()}`;
let orgId = ""; let wsId = ""; let userId = "";
const tag = `t08m-${RUN}`;
const appTx = <T,>(fn: (tx: Transaction) => Promise<T>) => withTenant({ orgId, workspaceId: wsId, actorId: userId }, fn);

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    orgId = org.id;
    const ws = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    wsId = ws.id;
    const u = (await systemDb.insert(users).values({
      orgId, workspaceId: wsId, email: `${tag}@example.test`, emailHash: hashEmail(`${tag}@example.test`), role: "approver",
    }).returning({ id: users.id }))[0]!;
    userId = u.id;
  } catch (e) {
    throw new Error(`totp suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

describe("T-08 TOTP", () => {
  it("stores the secret ENCRYPTED - the plaintext is not in the database", async () => {
    const secret = await appTx((tx) => beginEnrolment(tx, { userId, orgId, workspaceId: wsId }));
    const [row] = await systemDb.select().from(mfaTotp).where(eq(mfaTotp.userId, userId));
    expect(row!.secretCiphertext).not.toBe(secret);
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(row!.secretIv).toBeTruthy();
    expect(row!.secretTag).toBeTruthy();
  });

  it("confirms enrolment only with a correct code, and refuses a wrong one", async () => {
    expect(await appTx((tx) => confirmEnrolment(tx, userId, "000000"))).toBe(false);
    const [row] = await systemDb.select().from(mfaTotp).where(eq(mfaTotp.userId, userId));
    expect(row!.confirmedAt).toBeNull();
  });

  it("verifies a live code once, then refuses the SAME code (replay defence)", async () => {
    const secret = await appTx(async (tx) => {
      // fresh enrolment for this user
      await systemDb.delete(mfaTotp).where(eq(mfaTotp.userId, userId));
      const s = await beginEnrolment(tx, { userId, orgId, workspaceId: wsId });
      const code = codeForStep(s, currentStep());
      expect(await confirmEnrolment(tx, userId, code)).toBe(true);
      return s;
    });

    const code = codeForStep(secret, currentStep());
    // enrolment consumed a step; use the next window code for verification
    const nextStep = currentStep() + 1;
    const nextCode = codeForStep(secret, nextStep);
    const first = verifyCode(secret, nextCode, null, Date.now() + 30000);
    expect(first.ok).toBe(true);
    const replay = verifyCode(secret, nextCode, first.step, Date.now() + 30000);
    expect(replay.ok).toBe(false);
    void code;
    void nextCode;
  });

  it("refuses an out-of-window code and a malformed one", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    expect(verifyCode(secret, codeForStep(secret, currentStep() + 10), null).ok).toBe(false);
    expect(verifyCode(secret, "abc", null).ok).toBe(false);
    expect(verifyCode(secret, "12345", null).ok).toBe(false);
  });

  it("verifies for a user only once, and never for an unconfirmed enrolment", async () => {
    await systemDb.delete(mfaTotp).where(eq(mfaTotp.userId, userId));
    const secret = await appTx((tx) => beginEnrolment(tx, { userId, orgId, workspaceId: wsId }));
    // unconfirmed: refused even with the right code
    expect(await appTx((tx) => verifyForUser(tx, userId, codeForStep(secret, currentStep() + 1)))).toBe(false);
    // confirm at the CURRENT step, then verify with the NEXT one (strictly ahead, in window)
    expect(await appTx((tx) => confirmEnrolment(tx, userId, codeForStep(secret, currentStep())))).toBe(true);
    expect(await appTx((tx) => verifyForUser(tx, userId, codeForStep(secret, currentStep() + 1)))).toBe(true);
    // and the same code again is refused: replay
    expect(await appTx((tx) => verifyForUser(tx, userId, codeForStep(secret, currentStep() + 1)))).toBe(false);
  });

  it("no audit payload contains a TOTP secret or ciphertext", async () => {
    const rows = await systemDb.select({ meta: auditEvents.meta, action: auditEvents.action }).from(auditEvents);
    const mfa = rows.filter((r) => r.action.startsWith("auth.mfa"));
    for (const r of mfa) {
      const blob = JSON.stringify(r.meta ?? {});
      expect(blob).not.toMatch(/secret|ciphertext|otpauth/i);
    }
  });
});
