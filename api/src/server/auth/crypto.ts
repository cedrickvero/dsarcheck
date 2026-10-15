/**
 * Credential cryptography for T-08.
 *
 * Tokens (magic links, sessions) are stored ONLY as SHA-256 hashes: a database read
 * does not yield a usable credential. They are compared by hash equality inside the
 * RLS policy, never by a timing-sensitive string compare in application code.
 *
 * TOTP secrets must be recoverable to verify a code, so they are encrypted with
 * AES-256-GCM rather than hashed. The key comes from TOTP_ENCRYPTION_KEY, is required
 * in production, and is never derived from anything guessable. Each secret carries its
 * own IV, and the auth tag is stored alongside so tampering fails loudly.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/env";

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Normalise before hashing so "  A@B.com " and "a@b.com" are the same bucket. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashEmail(email: string): string {
  return createHash("sha256").update(normaliseEmail(email)).digest("hex");
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

function encryptionKey(): Buffer {
  const key = Buffer.from(env.TOTP_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("TOTP_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  }
  return key;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(secret: EncryptedSecret): string {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
