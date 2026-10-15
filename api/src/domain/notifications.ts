/**
 * Notification derivation (docs/03 notification bell).
 *
 * TODO(domain slice): port the notification derivation from the renderVals
 * notifications block of `design/reference/logic/workspace-logic.js`. Output is
 * per-role: what a handler sees differs from what an approver sees. Test the
 * derivation per role, not just the shape.
 */
export interface DerivedNotification {
  id: string;
  title: string;
  unread: boolean;
}

export function deriveNotifications(_actor: unknown, _cases: unknown[]): DerivedNotification[] {
  throw new Error("deriveNotifications() not implemented — port from design/reference/logic/workspace-logic.js");
}
