/**
 * Server-side authentication gate.
 *
 * Roles are the OWNER-APPROVED identifiers from the docs/01 matrix. Note that the
 * matrix's "Admin" column is `workspace_admin` here, and product copy that says
 * "founder" means `owner` - there is deliberately no separate founder role.
 *
 * Fails LOUDLY: an unauthenticated caller must never be treated as an
 * anonymous-but-allowed actor. Every mutation goes through `mutate()`, which calls
 * this first, so a missing session is a hard stop rather than a skip.
 *
 * TWO ENTRY POINTS, no bypass flag:
 *  - requireAuthFromRequest(req) - the request path. Parses the cookie itself, so it
 *    is fully exercisable in tests with a plain Request.
 *  - requireAuth() - the same check for callers that only have the ambient request
 *    (server actions), reading cookies via next/headers.
 * Both funnel into requireAuthFromToken(). There is no argument, env var or header
 * that makes either skip verification - the previous 501 stub is gone.
 *
 * MFA is ENFORCED here, not merely recorded: a session exists from the moment a magic
 * link is redeemed, but for a role that requires MFA it is refused until the TOTP step
 * has been completed. Nothing sets mfaSatisfiedAt except a verified code.
 *
 * Server-only: never import this into a client component.
 */
import { cookies } from "next/headers";
import { withLookup } from "@/db/client";
import { AppError, MfaRequiredError, UnauthenticatedError } from "@/server/http/errors";
import { requiresMfa } from "@/server/authz";
import { resolveSession } from "./session-store";

export type Role = "owner" | "approver" | "workspace_admin" | "request_handler" | "system_owner";

export const ROLES: readonly Role[] = [
  "owner",
  "approver",
  "workspace_admin",
  "request_handler",
  "system_owner",
];

export interface Actor {
  userId: string;
  /** Display label written into audit rows (never PII beyond a name). */
  label: string;
  orgId: string;
  workspaceId: string;
  roles: Role[];
  /** The session this actor authenticated with - needed to revoke it on sign-out.
   *  Optional: an Actor may be constructed without one (tests, future system actors). */
  sessionId?: string;
  /** True once the TOTP step is complete (always true for roles that do not need it). */
  mfaSatisfied?: boolean;
}

export const SESSION_COOKIE = "dsar_session";
export const SESSION_COOKIE_PROD = "__Host-dsar_session";

export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production" ? SESSION_COOKIE_PROD : SESSION_COOKIE;
}

/** Read the session token out of a raw Cookie header. Returns null when absent. */
export function parseSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    // LOW-3: only the name this environment actually issues. Accepting both meant a
    // development-named cookie was honoured in production.
    if (name === sessionCookieName()) {
      const value = rest.join("=");
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

/**
 * The single verification path. Resolves the token in withLookup({ sessionTokenHash }),
 * where RLS exposes exactly the one session row whose hash matches - no tenant is set,
 * so nothing else is visible.
 */
export async function requireAuthFromToken(
  token: string | null | undefined,
  opts: { allowMfaOutstanding?: boolean } = {},
): Promise<Actor> {
  if (!token) throw new UnauthenticatedError();

  const resolved = await withLookup({ sessionTokenHash: (await import("./crypto")).hashToken(token) }, (tx) =>
    resolveSession(tx, token),
  );
  if (!resolved) throw new UnauthenticatedError();

  const { session, user } = resolved;
  if (session.privilegeEpoch !== 0 && user.role === null) throw new UnauthenticatedError();

  const role = user.role as Role;
  if (!ROLES.includes(role)) throw new UnauthenticatedError();

  const mfaSatisfied = session.mfaSatisfiedAt !== null;
  if (requiresMfa(role) && !mfaSatisfied && !opts.allowMfaOutstanding) throw new MfaRequiredError();

  return {
    userId: user.id,
    label: user.email,
    orgId: user.orgId,
    workspaceId: user.workspaceId,
    roles: [role],
    sessionId: session.id,
    mfaSatisfied,
  };
}

export async function requireAuthFromRequest(req: Request): Promise<Actor> {
  return requireAuthFromToken(parseSessionCookie(req.headers.get("cookie")));
}

/**
 * PARTIAL authentication, for the MFA step ONLY.
 *
 * CRITICAL-2: requireAuth refuses a session whose MFA is outstanding, but the TOTP
 * routes must be reachable BY EXACTLY THAT SESSION or MFA is unsatisfiable for every
 * role that requires it - a deadlock. This resolves the session without the MFA check
 * and returns an actor marked mfaSatisfied: false.
 *
 * It is deliberately narrow and must stay that way: the only legitimate callers are
 * /api/auth/totp/enrol and /api/auth/totp/verify, both of which touch nothing but the
 * caller's own mfa_totp row. tests/auth-mfa-step.test.ts asserts that no other module
 * imports it, so widening this cannot happen quietly.
 */
export async function requireAuthForMfaStep(req: Request): Promise<Actor> {
  return requireAuthFromToken(parseSessionCookie(req.headers.get("cookie")), { allowMfaOutstanding: true });
}

export async function requireAuth(): Promise<Actor> {
  let header: string | null = null;
  try {
    const store = await cookies();
    header = store.toString();
  } catch {
    throw new AppError(401, "unauthenticated", "Sign-in required.");
  }
  return requireAuthFromToken(parseSessionCookie(header));
}

export { UnauthenticatedError, MfaRequiredError };
