import { AppError } from "@/server/http/errors";

export type Role = "owner" | "admin" | "handler" | "approver" | "viewer";

export interface Actor {
  userId: string;
  workspaceId: string;
  roles: Role[];
}

/**
 * Permission matrix (docs/01-product-and-roles.md).
 *
 * Server-side gate for every mutation and every read of customer data. There is
 * exactly one implementation of this on purpose: UI disabling is a convenience,
 * never a security control.
 *
 * TODO(authz slice): implement the matrix, then cover every cell with tests,
 * including the high-risk identity gate and approver-only actions.
 */
export function can(_actor: Actor, action: string, _resource?: unknown): boolean {
  throw new AppError(501, "not_implemented", `authz.can("${action}") is not implemented yet`);
}
