import { AppError } from "../http/errors";

export type Role = "owner" | "admin" | "handler" | "approver" | "viewer";

export interface Actor {
  userId: string;
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
 * Server-only: never import this into a client component.
 */
export async function requireAuth(): Promise<Actor> {
  throw new AppError(501, "not_implemented", "Authentication is not implemented yet");
}
