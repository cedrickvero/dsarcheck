/**
 * Derived notifications — ported from the notification block of `renderVals()` in
 * `design/reference/logic/workspace-logic.js`; rules in docs/05 § Notifications.
 *
 * Nothing here is stored: notifications are computed from open cases on every
 * render, so they cannot drift from the case state. Only the read/unread marks
 * are persisted, keyed by `caseId + kind` per user.
 *
 * A handler and an approver see different lists — that is the point of the
 * derivation, not an implementation detail.
 */
import { sla } from "./sla";
import type { CaseStatus, Risk, Tone } from "./types";

export type NotificationKind = "ap" | "hr" | "nw" | "cr" | "rr" | "ar" | "dl";

export type Role = "Handler" | "Approver";

export interface DerivedNotification {
  /** Stable key: caseId + kind. The read-mark is stored against this. */
  id: string;
  kind: NotificationKind;
  caseId: string;
  icon: string;
  tone: Tone;
  title: string;
  sub: string;
  /** `DSAR-2026-00418 · 11 days left` */
  meta: string;
  /** Cockpit tab to open. */
  tab: string;
  unread: boolean;
}

/**
 * The narrow case shape the derivation reads. It is a subset of `CaseState` so both the
 * full domain type and a minimal server projection satisfy it without any adapter.
 */
export interface NotificationCase {
  id: string;
  type: string;
  status: CaseStatus;
  risk: Risk;
  name: string;
  receivedAt: Date;
  extensionMonths: 0 | 1 | 2;
  closedAt?: Date | null;
  systems: { key: string; status: string; outcome?: string | null }[];
  lastAuditAction?: string;
  lastAuditReason?: string;
}

export interface DeriveNotificationsInput {
  role: Role;
  cases: NotificationCase[];
  now: Date;
  /** Data-source display names, keyed by `sourceKey`. */
  sourceNames: Record<string, string>;
  /** Read marks for the current user. */
  read?: Record<string, boolean>;
}

export function deriveNotifications(
  input: DeriveNotificationsInput,
): DerivedNotification[] {
  const { role, cases, now, sourceNames, read = {} } = input;
  const isApprover = role === "Approver";
  const out: DerivedNotification[] = [];

  for (const c of cases) {
    const state = sla({
      status: c.status,
      receivedAt: c.receivedAt,
      extensionMonths: c.extensionMonths,
      closedAt: c.closedAt ?? null,
      now,
    });

    // Closed and rejected cases raise nothing.
    if (!state.open) continue;

    const add = (
      kind: NotificationKind,
      icon: string,
      tone: Tone,
      title: string,
      sub: string,
      tab: string,
    ) => {
      const id = c.id + kind;
      out.push({
        id,
        kind,
        caseId: c.id,
        icon,
        tone,
        title,
        sub,
        meta: `${c.id} · ${state.label}`,
        tab,
        unread: !read[id],
      });
    };

    if (isApprover) {
      if (c.status === "Awaiting approval") {
        add(
          "ap",
          "stamp",
          "warn",
          "Approval needed",
          `${c.type} request from ${c.name} is ready for sign-off.`,
          "overview",
        );
      }
      if (c.risk === "High" && (c.status === "Verifying" || c.status === "New")) {
        add(
          "hr",
          "shield-alert",
          "bad",
          "High-risk identity check",
          `${c.name} needs an Approver decision before work starts.`,
          "identity",
        );
      }
      continue;
    }

    if (c.status === "New") {
      add(
        "nw",
        "inbox",
        "info",
        "New request",
        `${c.type} from ${c.name} arrived through the portal.`,
        "overview",
      );
    }

    if (String(c.lastAuditAction ?? "").startsWith("Changes requested")) {
      add(
        "cr",
        "message-square-warning",
        "warn",
        "Changes requested",
        c.lastAuditReason || "The approver returned this case.",
        "overview",
      );
    }

    // G18: a requester message or an info-request upload both surface as "Requester replied".
    if (String(c.lastAuditAction ?? "").startsWith("Requester")) {
      add(
        "rr",
        "message-square",
        "info",
        "Requester replied",
        `${c.name} replied on their request.`,
        "overview",
      );
    }

    const needsAction = c.systems.filter(
      (s) => s.status === "Action required" || s.outcome === "Action required",
    );
    if (needsAction.length > 0 && c.status !== "Awaiting approval") {
      add(
        "ar",
        "triangle-alert",
        "warn",
        "System needs action",
        `${needsAction.map((s) => sourceNames[s.key] ?? s.key).join(", ")} on ${c.name}’s case.`,
        "checklist",
      );
    }

    if (c.status !== "Awaiting approval" && state.daysLeft <= 5) {
      const title =
        state.daysLeft < 0
          ? `Overdue by ${-state.daysLeft} ${-state.daysLeft === 1 ? "day" : "days"}`
          : state.daysLeft === 0
            ? "Due today"
            : `Deadline in ${state.daysLeft} ${state.daysLeft === 1 ? "day" : "days"}`;
      add(
        "dl",
        "clock-alert",
        "bad",
        title,
        `${c.type} for ${c.name} is due ${state.deadline}.`,
        "overview",
      );
    }
  }

  return out;
}

/** The bell badge: caps at "9+", empty when nothing is unread. */
export function unreadBadge(count: number): string {
  if (count <= 0) return "";
  return count > 9 ? "9+" : String(count);
}

/** "Notifications, N unread" — the bell's aria-label. */
export function bellAriaLabel(count: number): string {
  return `Notifications, ${count} unread`;
}
