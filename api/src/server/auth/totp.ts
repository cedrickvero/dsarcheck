/**
 * TOTP (RFC 6238): 30-second steps, 6 digits, SHA-1 - the parameters every
 * authenticator app assumes.
 *
 * Two protections beyond the arithmetic:
 *  - a limited window (one step either side) so a clock a little out of sync still
 *    works, but a stale code does not;
 *  - replay defence via last_used_step. A code whose step is not strictly ahead of the
 *    last accepted one is refused, so an observed code cannot be reused inside its own
 *    validity window. That is the difference between "verified" and "verified once".
 *
 * The secret is encrypted at rest and is never returned, logged, or written to an
 * audit payload.
 */
import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { mfaTotp } from "@/db/schema";
import type { Transaction } from "@/db/client";
import { AppError } from "@/server/http/errors";
import { decryptSecret, encryptSecret } from "./crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const WINDOW = 1;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("totp: invalid base32 secret");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function codeForStep(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 1_000_000).padStart(6, "0");
}

export function currentStep(at: number = Date.now()): number {
  return Math.floor(at / 1000 / STEP_SECONDS);
}

export interface VerificationResult {
  ok: boolean;
  step: number | null;
}

/** Constant-time-ish comparison of two 6-digit codes. */
function sameCode(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function verifyCode(
  secretBase32: string,
  presented: string,
  lastUsedStep: number | null,
  at: number = Date.now(),
): VerificationResult {
  const now = currentStep(at);
  const candidate = presented.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(candidate)) return { ok: false, step: null };

  for (let drift = -WINDOW; drift <= WINDOW; drift += 1) {
    const step = now + drift;
    if (lastUsedStep !== null && step <= lastUsedStep) continue; // replay
    if (sameCode(codeForStep(secretBase32, step), candidate)) return { ok: true, step };
  }
  return { ok: false, step: null };
}

/** Begin enrolment: store an encrypted, UNCONFIRMED secret. Idempotent - re-enrolling
 *  replaces an UNCONFIRMED secret (one TOTP row per user), but refuses to touch a confirmed
 *  one, which would lock the user out of their own authenticator. */
export async function beginEnrolment(
  tx: Transaction,
  args: { userId: string; orgId: string; workspaceId: string },
): Promise<string> {
  const [existing] = await tx
    .select({ confirmedAt: mfaTotp.confirmedAt })
    .from(mfaTotp)
    .where(eq(mfaTotp.userId, args.userId))
    .limit(1);
  if (existing?.confirmedAt) {
    throw new AppError(409, "already_enrolled", "MFA is already enrolled.");
  }

  const secret = generateSecret();
  const enc = encryptSecret(secret);
  const values = {
    secretCiphertext: enc.ciphertext,
    secretIv: enc.iv,
    secretTag: enc.tag,
  };

  if (existing) {
    await tx.update(mfaTotp).set(values).where(eq(mfaTotp.userId, args.userId));
  } else {
    await tx.insert(mfaTotp).values({
      userId: args.userId,
      orgId: args.orgId,
      workspaceId: args.workspaceId,
      ...values,
    });
  }
  return secret;
}

async function loadSecret(tx: Transaction, userId: string) {
  const [row] = await tx.select().from(mfaTotp).where(eq(mfaTotp.userId, userId)).limit(1);
  if (!row) return null;
  return {
    row,
    secret: decryptSecret({
      ciphertext: row.secretCiphertext,
      iv: row.secretIv,
      tag: row.secretTag,
    }),
  };
}

/** Confirm enrolment. Only a correct code from the new secret sets confirmed_at. */
export async function confirmEnrolment(
  tx: Transaction,
  userId: string,
  presented: string,
): Promise<boolean> {
  const found = await loadSecret(tx, userId);
  if (!found) return false;
  const result = verifyCode(found.secret, presented, found.row.lastUsedStep);
  if (!result.ok) return false;
  await tx
    .update(mfaTotp)
    .set({ confirmedAt: new Date(), lastUsedStep: result.step })
    .where(eq(mfaTotp.userId, userId));
  return true;
}

/** Verify during sign-in. Advances last_used_step, which is what defeats replay. */
export async function verifyForUser(
  tx: Transaction,
  userId: string,
  presented: string,
): Promise<boolean> {
  const found = await loadSecret(tx, userId);
  if (!found || !found.row.confirmedAt) return false;
  const result = verifyCode(found.secret, presented, found.row.lastUsedStep);
  if (!result.ok) return false;
  await tx
    .update(mfaTotp)
    .set({ lastUsedStep: result.step })
    .where(eq(mfaTotp.userId, userId));
  return true;
}

export async function isEnrolled(tx: Transaction, userId: string): Promise<boolean> {
  const [row] = await tx
    .select({ confirmedAt: mfaTotp.confirmedAt })
    .from(mfaTotp)
    .where(eq(mfaTotp.userId, userId))
    .limit(1);
  return Boolean(row?.confirmedAt);
}
