/**
 * Requester portal: sign-in credentials (link + 6-digit code), email-confirmation links,
 * the workspace+email-scoped session, and the "your requests" query.
 *
 * A requester has no user account, so this is a parallel credential path to the staff
 * magic-link: requester_tokens are single-use and hashed at rest; requester_sessions are
 * scoped to a workspace AND an email and idle out after 30 minutes (docs/05).
 *
 * Redemption is an atomic UPDATE ... WHERE used_at IS NULL, so two concurrent
 * redemptions cannot both succeed - the second finds nothing to update.
 */
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { cases, requesterSessions, requesterTokens } from "@/db/schema";
import { withLookup, type Transaction } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";
import { env } from "@/env";
import { hashEmail, hashToken, newToken, normaliseEmail } from "@/server/auth/crypto";

export const REQUESTER_COOKIE = "requester_session";
export const REQUESTER_COOKIE_PROD = "__Host-requester_session";

/** The requester session cookie is distinct from the staff session cookie. */
export function requesterCookieName(): string {
  return process.env.NODE_ENV === "production" ? REQUESTER_COOKIE_PROD : REQUESTER_COOKIE;
}

export interface RequesterPortalRef {
  orgId: string;
  workspaceId: string;
}

/** Case-insensitive predicate: does a case belong to this requester email? */
export function requesterEmailMatches(email: string) {
  return sql`lower(${cases.requesterEmail}) = lower(${normaliseEmail(email)})`;
}

/** At least one case in the current tenant carries this email (drives "does this address exist"). */
export async function hasRequesterCases(tx: Transaction, email: string): Promise<boolean> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(cases)
    .where(requesterEmailMatches(email));
  return (row?.n ?? 0) > 0;
}

/**
 * The sign-in request's one gate: issue a credential only when the address has at least one
 * case. Returns null for an unknown address (the caller still returns the generic response),
 * so the endpoint cannot enumerate requesters.
 */
export async function requestSignInCredential(
  tx: Transaction,
  portal: RequesterPortalRef,
  email: string,
  origin: string,
): Promise<SignInCredential | null> {
  if (!(await hasRequesterCases(tx, email))) return null;
  return issueSignInCredential(tx, portal, email, origin);
}

export interface SignInCredential {
  token: string;
  code: string;
  url: string;
}

/**
 * Mint a single-use sign-in credential (link token + 6-digit code). Runs inside
 * withTenant(portal), so the insert is tenant-scoped by RLS. The 6-digit code is for
 * typing convenience; a collision with a live code in the same workspace aborts the
 * insert via the partial unique index, and the caller returns the generic response.
 */
export async function issueSignInCredential(
  tx: Transaction,
  portal: RequesterPortalRef,
  email: string,
  origin: string,
): Promise<SignInCredential> {
  const token = newToken();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await tx.insert(requesterTokens).values({
    orgId: portal.orgId,
    workspaceId: portal.workspaceId,
    purpose: "sign_in",
    emailHash: hashEmail(email),
    email: normaliseEmail(email),
    tokenHash: hashToken(token),
    codeHash: hashToken(code),
    expiresAt: new Date(Date.now() + env.MAGIC_LINK_TTL_MINUTES * 60_000),
  });
  return { token, code, url: `${origin}/api/track/callback?token=${encodeURIComponent(token)}` };
}

export interface RedeemedRequester {
  orgId: string;
  workspaceId: string;
  email: string;
}

/**
 * Redeem the sign-in link. Runs in withLookup({ requesterTokenHash }) so only the row
 * whose token the caller holds is visible. Single-use + expiry guarded atomically.
 */
export async function redeemSignInLink(tx: Transaction, token: string): Promise<RedeemedRequester | null> {
  const [row] = await tx
    .update(requesterTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(requesterTokens.tokenHash, hashToken(token)),
        eq(requesterTokens.purpose, "sign_in"),
        isNull(requesterTokens.usedAt),
        gt(requesterTokens.expiresAt, new Date()),
      ),
    )
    .returning({ orgId: requesterTokens.orgId, workspaceId: requesterTokens.workspaceId, email: requesterTokens.email });
  return row ?? null;
}

/**
 * Redeem the 6-digit code. Runs inside withTenant(portal) so the code is scoped to the
 * workspace the requester reached us on - the same code in a different workspace cannot
 * collide. Single-use + expiry guarded atomically.
 */
export async function redeemSignInCode(tx: Transaction, code: string): Promise<RedeemedRequester | null> {
  const [row] = await tx
    .update(requesterTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(requesterTokens.codeHash, hashToken(code)),
        eq(requesterTokens.purpose, "sign_in"),
        isNull(requesterTokens.usedAt),
        gt(requesterTokens.expiresAt, new Date()),
      ),
    )
    .returning({ orgId: requesterTokens.orgId, workspaceId: requesterTokens.workspaceId, email: requesterTokens.email });
  return row ?? null;
}

/** Issue a requester session and return the ONE time the raw token exists. */
export async function createRequesterSession(
  tx: Transaction,
  portal: RequesterPortalRef,
  email: string,
): Promise<{ token: string }> {
  const token = newToken();
  await tx.insert(requesterSessions).values({
    orgId: portal.orgId,
    workspaceId: portal.workspaceId,
    emailHash: hashEmail(email),
    email: normaliseEmail(email),
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + env.SESSION_ABSOLUTE_DAYS * 86_400_000),
  });
  return { token };
}

/**
 * Resolve a presented requester session token. Runs in withLookup({ requesterSessionTokenHash }).
 * Idle + absolute + revocation all return null; callers must not distinguish them.
 */
export async function resolveRequesterSession(
  tx: Transaction,
  token: string,
): Promise<{ orgId: string; workspaceId: string; email: string } | null> {
  const [row] = await tx
    .select()
    .from(requesterSessions)
    .where(eq(requesterSessions.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;

  const now = Date.now();
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() <= now) return null;
  if (now - row.lastSeenAt.getTime() > env.REQUESTER_SESSION_IDLE_MINUTES * 60_000) return null;

  // The session row was read via the token-hash policy. Its workspace is the tenant, so set
  // it before touching last_seen_at — otherwise the UPDATE is invisible under RLS (the
  // token_lookup policy is SELECT-only) and the 30-minute idle timer would never slide.
  await tx.execute(sql`select set_config('app.workspace_id', ${row.workspaceId}, true)`);
  await tx.execute(sql`select set_config('app.org_id', ${row.orgId}, true)`);
  await tx.update(requesterSessions).set({ lastSeenAt: new Date() }).where(eq(requesterSessions.id, row.id));

  return { orgId: row.orgId, workspaceId: row.workspaceId, email: row.email };
}

/** Mint a single-use email-confirmation link (G2). Runs inside withTenant(portal). */
export async function issueConfirmationLink(
  tx: Transaction,
  portal: RequesterPortalRef,
  caseId: string,
  email: string,
  origin: string,
): Promise<{ token: string; url: string }> {
  const token = newToken();
  await tx.insert(requesterTokens).values({
    orgId: portal.orgId,
    workspaceId: portal.workspaceId,
    purpose: "confirm_email",
    emailHash: hashEmail(email),
    email: normaliseEmail(email),
    caseId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + env.MAGIC_LINK_TTL_MINUTES * 60_000),
  });
  return { token, url: `${origin}/verify/${encodeURIComponent(token)}` };
}

export interface RedeemedConfirmation {
  caseId: string;
  orgId: string;
  workspaceId: string;
  email: string;
}

/** Redeem the confirmation link (G2). Single-use, guarded atomically. */
export async function redeemConfirmationLink(tx: Transaction, token: string): Promise<RedeemedConfirmation | null> {
  const [row] = await tx
    .update(requesterTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(requesterTokens.tokenHash, hashToken(token)),
        eq(requesterTokens.purpose, "confirm_email"),
        isNull(requesterTokens.usedAt),
        gt(requesterTokens.expiresAt, new Date()),
      ),
    )
    .returning({
      caseId: requesterTokens.caseId,
      orgId: requesterTokens.orgId,
      workspaceId: requesterTokens.workspaceId,
      email: requesterTokens.email,
    });
  return (row?.caseId ? row : null) as RedeemedConfirmation | null;
}

/** The requester-safe projection of a case, for the "Your requests" list. */
export interface RequesterRequestCard {
  caseNumber: string;
  requestType: string;
  status: string;
  infoRequested: boolean;
  createdAt: Date;
  statutoryDueAt: Date | null;
  closedAt: Date | null;
}

/** List a requester's own cases in the current tenant (email-scoped, newest first). */
export async function listRequesterRequests(tx: Transaction, email: string): Promise<RequesterRequestCard[]> {
  return tx
    .select({
      caseNumber: cases.caseNumber,
      requestType: cases.requestType,
      status: cases.status,
      infoRequested: cases.infoRequested,
      createdAt: cases.createdAt,
      statutoryDueAt: cases.statutoryDueAt,
      closedAt: cases.closedAt,
    })
    .from(cases)
    .where(requesterEmailMatches(email))
    .orderBy(sql`${cases.createdAt} desc`);
}

/** Requester-facing status pill (docs/03 § H2). Internal statuses map to plain labels. */
export interface RequesterStatusView {
  label: string;
  bg: string;
  fg: string;
}

/** Plain title per request type (docs/03 § H2). */
export function requesterTitle(requestType: string): string {
  switch (requestType) {
    case "Access":
      return "Copy of your personal data";
    case "Rectification":
      return "Correct your personal data";
    case "Erasure":
      return "Delete your personal data";
    case "Portability":
      return "Your data in a portable format";
    case "Objection":
      return "Stop using your data";
    default:
      return requestType;
  }
}

export function requesterStatusView(status: string, infoRequested: boolean): RequesterStatusView {
  const s = status.toLowerCase();
  if (s === "completed") return { label: "Completed", bg: "#D9F2E7", fg: "#0E6B4D" };
  if (s === "rejected") return { label: "Closed", bg: "#F2F4F7", fg: "#475467" };
  if (s === "extended") return { label: "Extended", bg: "#D9E8FF", fg: "#175CD3" };
  if (s === "awaiting approval") return { label: "Final review", bg: "#D9E8FF", fg: "#175CD3" };
  if (s === "in progress") return { label: "Collecting your data", bg: "#D7F0EF", fg: "#0A6463" };
  // New / Verifying: amber when information has been requested, otherwise neutral.
  return infoRequested
    ? { label: "Confirming your identity", bg: "#FDF0DC", fg: "#B54708" }
    : { label: "Confirming your identity", bg: "#D7F0EF", fg: "#0A6463" };
}

/** The one-sentence status summary (docs/03 § H2). */
export function requesterSummary(status: string, infoRequested: boolean): string {
  const s = status.toLowerCase();
  if (infoRequested) return "We need one more document from you before we can start collecting your data.";
  if (s === "completed") return "Your request is complete.";
  if (s === "rejected") return "We've closed this request.";
  if (s === "extended") return "Your identity is confirmed and we're still collecting your data. We've extended the deadline.";
  if (s === "awaiting approval") return "We're completing a final review before we respond.";
  if (s === "in progress") return "Your identity is confirmed. We're now checking every place your data may be held.";
  return "We've received your request and we're confirming your identity.";
}

export interface RequesterCaseDetail {
  caseNumber: string;
  requestType: string;
  status: string;
  infoRequested: boolean;
  receivedAt: Date;
  statutoryDueAt: Date | null;
  closedAt: Date | null;
  extensionMonths: number;
  details: string;
}

/** Fetch one of the requester's own cases by number (email- AND tenant-scoped). */
export async function getRequesterCaseDetail(
  tx: Transaction,
  caseNumber: string,
  email: string,
): Promise<RequesterCaseDetail | null> {
  const [row] = await tx
    .select({
      caseNumber: cases.caseNumber,
      requestType: cases.requestType,
      status: cases.status,
      infoRequested: cases.infoRequested,
      receivedAt: cases.receivedAt,
      statutoryDueAt: cases.statutoryDueAt,
      closedAt: cases.closedAt,
      extensionMonths: cases.extensionMonths,
      details: cases.details,
    })
    .from(cases)
    .where(and(eq(cases.caseNumber, caseNumber), requesterEmailMatches(email)))
    .limit(1);
  return row ?? null;
}

/**
 * Confirm the requester's email (G2): redeem the confirmation link, mark the case's
 * email_verification Confirmed, and log "Email address confirmed" as the requester — all in
 * one transaction so the flag and the audit cannot diverge.
 */
export async function confirmRequesterEmail(token: string): Promise<{ caseNumber: string; email: string } | null> {
  return withLookup({ requesterTokenHash: hashToken(token) }, async (tx) => {
    const redeemed = await redeemConfirmationLink(tx, token);
    if (!redeemed) return null;

    await tx.execute(sql`select set_config('app.workspace_id', ${redeemed.workspaceId}, true)`);
    await tx.execute(sql`select set_config('app.org_id', ${redeemed.orgId}, true)`);
    await tx.execute(sql`select set_config('app.actor_id', 'requester', true)`);

    const [row] = await tx
      .update(cases)
      .set({ emailVerification: "Confirmed" })
      .where(and(eq(cases.id, redeemed.caseId), eq(cases.workspaceId, redeemed.workspaceId)))
      .returning({ caseNumber: cases.caseNumber });
    if (!row) return null;

    await writeAuditEvent(tx, {
      orgId: redeemed.orgId,
      workspaceId: redeemed.workspaceId,
      actorId: "requester",
      actorLabel: redeemed.email,
      action: "Email address confirmed",
      category: "Identity",
      reason: "Requester confirmed their email address",
      objectType: "case",
      objectId: redeemed.caseId,
      meta: { caseNumber: row.caseNumber },
    });

    return { caseNumber: row.caseNumber, email: redeemed.email };
  });
}
