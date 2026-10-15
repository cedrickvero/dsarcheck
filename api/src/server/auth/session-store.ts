/**
 * Opaque sessions. Only the token HASH is stored, so a database read yields no usable
 * credential.
 *
 * Two expiries, both required: an absolute one (session cannot outlive it however
 * active it is) and an idle one (an untouched session stops working). Revocation is an
 * UPDATE, not a DELETE - the app role holds no DELETE on any table.
 *
 * `privilege_epoch` is how "rotate on privilege change" is enforced without hunting
 * down live sessions: bumping the user's epoch invalidates every session issued under
 * the old one, because the stored epoch no longer matches.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { sql as raw } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import type { Transaction } from "@/db/client";
import { env } from "@/env";
import { newToken, hashToken } from "./crypto";

export interface SessionRecord {
  id: string;
  orgId: string;
  workspaceId: string;
  userId: string;
  privilegeEpoch: number;
  expiresAt: Date;
  lastSeenAt: Date;
  mfaSatisfiedAt: Date | null;
  revokedAt: Date | null;
}

/** Issue a session and return the ONE time the raw token exists outside the client. */
export async function createSession(
  tx: Transaction,
  args: { userId: string; orgId: string; workspaceId: string },
): Promise<{ token: string; sessionId: string }> {
  const token = newToken();
  const [row] = await tx
    .insert(sessions)
    .values({
      orgId: args.orgId,
      workspaceId: args.workspaceId,
      userId: args.userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.SESSION_ABSOLUTE_DAYS * 86_400_000),
    })
    .returning({ id: sessions.id });
  if (!row) throw new Error("session: insert returned no row");
  return { token, sessionId: row.id };
}

/**
 * Resolve a presented token to its session and user, applying both expiries and
 * revocation. Returns null for anything unusable - callers must not distinguish
 * "expired" from "revoked" from "never existed" in a response.
 */
export async function resolveSession(
  tx: Transaction,
  token: string,
): Promise<{ session: SessionRecord; user: typeof users.$inferSelect } | null> {
  const [row] = await tx
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;

  const now = Date.now();
  const idleMs = env.SESSION_IDLE_MINUTES * 60_000;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() <= now) return null;
  if (now - row.lastSeenAt.getTime() > idleMs) return null;

  // The session row is visible through the token policy; its workspace_id IS the
  // tenant. Setting it here is what lets the user row below be read at all - with no
  // tenant, that SELECT returns nothing and sign-in can never complete.
  await tx.execute(raw`select set_config('app.workspace_id', ${row.workspaceId}, true)`);

  const [user] = await tx.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user || user.disabledAt) return null;

  await tx
    .update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.id, row.id));

  return {
    session: {
      id: row.id,
      orgId: row.orgId,
      workspaceId: row.workspaceId,
      userId: row.userId,
      privilegeEpoch: row.privilegeEpoch,
      expiresAt: row.expiresAt,
      lastSeenAt: row.lastSeenAt,
      mfaSatisfiedAt: row.mfaSatisfiedAt,
      revokedAt: row.revokedAt,
    },
    user,
  };
}

export async function markMfaSatisfied(tx: Transaction, sessionId: string): Promise<void> {
  await tx.update(sessions).set({ mfaSatisfiedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Revoke one session. Idempotent; the audit event is written by the caller. */
export async function revokeSession(tx: Transaction, sessionId: string): Promise<void> {
  await tx
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/**
 * Rotate on privilege change: every session for this user that is still live and was
 * issued under the current epoch is revoked, and the epoch advances so any token
 * minted before the change can never resolve again.
 */
export async function rotateOnPrivilegeChange(tx: Transaction, userId: string): Promise<number> {
  const [row] = await tx
    .select({ epoch: sql<number>`coalesce(max(privilege_epoch), 0)::int` })
    .from(sessions)
    .where(eq(sessions.userId, userId));
  const next = (row?.epoch ?? 0) + 1;
  await tx
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  await tx.update(sessions).set({ privilegeEpoch: next }).where(eq(sessions.userId, userId));
  return next;
}
