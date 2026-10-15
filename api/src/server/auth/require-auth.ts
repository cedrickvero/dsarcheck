import { AppError } from "@/server/http/errors";

export type Role = "owner" | "admin" | "handler" | "approver" | "viewer";

export interface Actor {
  userId: string;
  /** Display label written into audit rows (never PII beyond a name). */
  label: string;
  orgId: string;
  workspaceId: string;
  roles: Role[];
}

/**
 * Server-side authentication gate.
 *
 * TODO(auth slice, T-08): verify the session + MFA and return the actor.
 * Role gates are enforced on the server - UI disabling is a convenience, never
 * a security control.
 *
 * Fails LOUDLY: an unauthenticated caller must never be treated as an
 * anonymous-but-allowed actor. Every mutation goes through `mutate()`, which
 * calls this first, so a missing session is a hard stop rather than a skip.
 *
 * Server-only: never import this into a client component.
 */
export async function requireAuth(): Promise<Actor> {
  throw new AppError(501, "not_implemented", "Authentication is not implemented yet");
}
