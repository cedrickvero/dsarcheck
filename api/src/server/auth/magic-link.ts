/**
 * Magic-link sign-in. Single-use, short-lived, hashed at rest, bound to the address
 * that requested it and to that user's workspace.
 *
 * "Do not reveal whether an email exists": an address with no user produces the
 * identical response and NO row. The timing difference is not corrected here and is
 * recorded as a known limitation rather than pretended away.
 *
 * Redemption is one atomic UPDATE ... WHERE used_at IS NULL, so two concurrent
 * redemptions cannot both succeed - the second finds nothing to update.
 */
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { magicLinks, users } from "@/db/schema";
import type { Transaction } from "@/db/client";
import { env } from "@/env";
import { hashToken, newToken, normaliseEmail, hashEmail } from "./crypto";

export interface IssuedLink {
  /** Raw token - exists here and in the email, nowhere else. */
  token: string | null;
  userId: string | null;
  orgId: string | null;
  workspaceId: string | null;
}

/**
 * Issue a link for `email`. Returns nulls when the address has no user (the caller
 * still returns the generic success response).
 *
 * The user lookup runs in the caller's withLookup({ emailHash }) transaction: with no
 * tenant set, RLS exposes exactly the row whose hash was presented, so this cannot read
 * any other user.
 */
export async function issueLink(
  tx: Transaction,
  email: string,
  origin: string,
): Promise<IssuedLink & { url: string | null; role: string | null }> {
  const normalised = normaliseEmail(email);
  // HIGH-1: an address can legitimately belong to more than one workspace. Matching one
  // row at random would be a cross-tenant hazard, so an ambiguous address is refused
  // outright (the caller still returns the generic response). Choosing among them needs
  // a workspace-selection step that does not exist yet - recorded as a limitation rather
  // than silently resolved.
  // The lookup transaction has already set app.lookup_email_hash, and the users_email_lookup
  // policy exposes exactly the rows whose (normalised) hash matches - so a raw `email = ?`
  // predicate here is both redundant and subtly wrong: a stored email that differs only in
  // case is in the same hash bucket and MUST count, or an ambiguous address would be
  // under-counted and one row picked instead of refusing.
  const matches = await tx.select().from(users);
  if (matches.length > 1) {
    return { token: null, userId: null, orgId: null, workspaceId: null, url: null, role: null };
  }
  const user = matches[0];
  if (!user || user.disabledAt) {
    return { token: null, userId: null, orgId: null, workspaceId: null, url: null, role: null };
  }

  // The user row was found through the email-hash policy. Its workspace IS the tenant,
  // and the insert below must satisfy the tenant policy's WITH CHECK, so set it now.
  await tx.execute(sql`select set_config('app.workspace_id', ${user.workspaceId}, true)`);

  const token = newToken();
  await tx.insert(magicLinks).values({
    orgId: user.orgId,
    workspaceId: user.workspaceId,
    userId: user.id,
    emailHash: hashEmail(normalised),
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + env.MAGIC_LINK_TTL_MINUTES * 60_000),
  });

  const url = `${origin}/api/auth/callback?token=${encodeURIComponent(token)}`;
  return {
    token,
    userId: user.id,
    orgId: user.orgId,
    workspaceId: user.workspaceId,
    url,
    role: user.role,
  };
}

/**
 * Redeem a link. Runs in withLookup({ magicTokenHash }) so only the matching row is
 * visible. The UPDATE is guarded on used_at IS NULL and expiry, so a link is
 * single-use even under concurrent redemption.
 */
export async function redeemLink(
  tx: Transaction,
  token: string,
): Promise<{ userId: string; orgId: string; workspaceId: string } | null> {
  const [row] = await tx
    .update(magicLinks)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(magicLinks.tokenHash, hashToken(token)),
        isNull(magicLinks.usedAt),
        gt(magicLinks.expiresAt, new Date()),
      ),
    )
    .returning({
      userId: magicLinks.userId,
      orgId: magicLinks.orgId,
      workspaceId: magicLinks.workspaceId,
    });
  return row ?? null;
}

/** Count a user's unconsumed links - used by tests to prove single-use. */
export async function liveLinkCount(tx: Transaction, userId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(magicLinks)
    .where(and(eq(magicLinks.userId, userId), isNull(magicLinks.usedAt)));
  return row?.n ?? 0;
}
