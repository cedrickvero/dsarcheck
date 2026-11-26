/**
 * DB-backed rate limiting (owner decision: not in-memory, so limits survive a restart
 * and hold across instances).
 *
 * Identifiers are HASHED before they are stored. The bucket key is never a raw email
 * or raw IP: magic-link requests bucket on hash(email + workspace), authenticated
 * actions on the user id, and only where nothing better exists on a hash of the IP.
 *
 * The check and the record happen in one statement pair inside the caller's
 * transaction, so a burst cannot slip between the count and the insert.
 */
import { and, eq, gt, sql } from "drizzle-orm";
import { rateLimitHits } from "@/db/schema";
import type { Transaction } from "@/db/client";
import { RateLimitError } from "@/server/http/errors";
import { hashToken } from "./crypto";

export type RateLimitScope = "magic_link_request" | "magic_link_redeem" | "totp_verify" | "requester_sign_in_request" | "requester_sign_in_redeem";

export function bucketKey(parts: readonly (string | null | undefined)[]): string {
  return hashToken(parts.filter((p): p is string => Boolean(p)).join("|"));
}

export interface RateLimitCheck {
  bucketKey: string;
  scope: RateLimitScope;
  limit: number;
  windowSeconds: number;
  workspaceId?: string | null;
}

/**
 * Count the hits inside the window and record this one. Throws RateLimitError when the
 * limit is already reached - the caller returns the same generic response either way,
 * so throttling cannot be used to distinguish a real account from a missing one.
 */
export async function enforceRateLimit(tx: Transaction, check: RateLimitCheck): Promise<void> {
  const since = new Date(Date.now() - check.windowSeconds * 1000);
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(rateLimitHits)
    .where(
      and(
        eq(rateLimitHits.bucketKey, check.bucketKey),
        eq(rateLimitHits.scope, check.scope),
        gt(rateLimitHits.at, since),
      ),
    );

  if ((row?.n ?? 0) >= check.limit) throw new RateLimitError();

  await tx.insert(rateLimitHits).values({
    bucketKey: check.bucketKey,
    scope: check.scope,
    workspaceId: check.workspaceId ?? null,
    expiresAt: new Date(Date.now() + check.windowSeconds * 1000),
  });
}

/**
 * Remove rows past expiry via the SECURITY DEFINER function, which can delete only
 * expired rate-limit rows - the app role holds no DELETE on any table.
 */
export async function cleanupExpiredHits(): Promise<number> {
  const { pool } = await import("@/db/client");
  const { rows } = await pool.query<{ cleanup_rate_limit_hits: number }>(
    "select cleanup_rate_limit_hits()",
  );
  return rows[0]?.cleanup_rate_limit_hits ?? 0;
}
