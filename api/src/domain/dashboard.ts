/**
 * The direct dashboard: the eight KPI tiles and the "Needs attention" list — ported from
 * `renderVals()` in `design/reference/logic/workspace-direct-logic.js` and docs/03 § B.
 *
 * Pure. The caller passes already-authorized, already-scoped rows plus a clock; this decides
 * what the numbers are, in what order the attention list appears, and what the screen says.
 */
import { formatDate } from "./dates";
import { sla } from "./sla";
import type { CaseListRow } from "./caseList";
import type { Risk } from "./types";

/** A case as the dashboard reads it: the list row plus what the tiles need. */
export interface DashboardRow extends CaseListRow {
  risk: Risk;
  /** Null until the case is closed. */
  closedAt: Date | null;
  /** Count of checklist rows in "Action required" - the tile and one attention reason. */
  actionRequired: number;
  /** Display name of the workspace's approver, for "Awaiting approval by ...". */
  approverName: string;
}

export interface CaseStats {
  open: number;
  dueSoon: number;
  overdue: number;
  awaitingApproval: number;
  highRiskVerifications: number;
  actionRequiredSystems: number;
  completedThisMonth: number;
  /** Mean days from receipt to closure, 1 decimal; null when nothing has closed. */
  avgClosureDays: number | null;
}

const DUE_SOON_DAYS = 7;

function isOpen(row: DashboardRow, at: Date): boolean {
  return sla({
    status: row.status,
    receivedAt: row.receivedAt,
    extensionMonths: row.extensionMonths,
    closedAt: row.closedAt,
    now: at,
  }).open;
}

/** `YYYY-MM` of a date in a given IANA timezone - the workspace's month, not the server's. */
export function monthKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(date);
}

export function caseStats(rows: readonly DashboardRow[], at: Date, timeZone = "UTC"): CaseStats {
  const open = rows.filter((row) => isOpen(row, at));
  const closed = rows.filter((row) => row.closedAt !== null);

  const dueSoon = open.filter((row) => {
    const left = sla({
      status: row.status,
      receivedAt: row.receivedAt,
      extensionMonths: row.extensionMonths,
      closedAt: row.closedAt,
      now: at,
    }).daysLeft;
    return left >= 0 && left <= DUE_SOON_DAYS;
  }).length;

  const overdue = open.filter((row) => {
    const left = sla({
      status: row.status,
      receivedAt: row.receivedAt,
      extensionMonths: row.extensionMonths,
      closedAt: row.closedAt,
      now: at,
    }).daysLeft;
    return left < 0;
  }).length;

  // "Completed this month" is about COMPLETED cases: a Rejected case has a closedAt but is
  // not a completion, so it must not count (guardrail L-1). The month is the workspace's,
  // not the server's (L-2): a closure at 23:00 UTC on the last day of the month is often
  // already the first of the next month in Europe/Berlin.
  const completed = closed.filter((row) => row.status === "Completed");
  const thisMonth = monthKey(at, timeZone);
  const completedThisMonth = completed.filter(
    (row) => monthKey(row.closedAt!, timeZone) === thisMonth,
  ).length;

  const closures = completed
    .map((row) => (row.closedAt!.getTime() - row.receivedAt.getTime()) / 86_400_000)
    .filter((days) => days >= 0);

  return {
    open: open.length,
    dueSoon,
    overdue,
    awaitingApproval: open.filter((row) => row.status === "Awaiting approval").length,
    highRiskVerifications: open.filter(
      (row) =>
        (row.status === "Verifying" || row.status === "New") && row.risk === "High",
    ).length,
    actionRequiredSystems: open.reduce((sum, row) => sum + row.actionRequired, 0),
    completedThisMonth,
    avgClosureDays:
      closures.length > 0
        ? Math.round((closures.reduce((a, b) => a + b, 0) / closures.length) * 10) / 10
        : null,
  };
}

// ── Needs attention ──────────────────────────────────────────────────────────

export interface AttentionItem {
  /** 0..5, lower blocks closure harder. */
  rank: number;
  daysLeft: number;
  caseNumber: string;
  requesterName: string;
  requestType: string;
  /** The "next required action" column - final copy. */
  why: string;
  ownerName: string | null;
  status: string;
}

/**
 * The ranking is the product rule (docs/03 § B): a passed deadline outranks a waiting
 * approval, which outranks a high-risk identity check, and so on. Ties break by days left,
 * so within a rank the nearest deadline comes first.
 */
export function attentionItems(rows: readonly DashboardRow[], at: Date): AttentionItem[] {
  const items: (AttentionItem | null)[] = rows
    .filter((row) => isOpen(row, at))
    .map((row) => {
      const state = sla({
        status: row.status,
        receivedAt: row.receivedAt,
        extensionMonths: row.extensionMonths,
        closedAt: row.closedAt,
        now: at,
      });
      const act = row.actionRequired;

      let why: string;
      let rank: number;
      if (state.daysLeft < 0) {
        why = "Statutory deadline passed";
        rank = 0;
      } else if (row.status === "Awaiting approval") {
        why = `Awaiting approval by ${row.approverName}`;
        rank = 1;
      } else if ((row.status === "Verifying" || row.status === "New") && row.risk === "High") {
        why = "High-risk identity check";
        rank = 2;
      } else if (act > 0) {
        why = `${act} ${act === 1 ? "system" : "systems"} in Action required`;
        rank = 3;
      } else if (state.daysLeft <= DUE_SOON_DAYS) {
        why = "Due within 7 days";
        rank = 4;
      } else if (row.status === "Verifying" || row.status === "New") {
        why = "Identity verification pending";
        rank = 5;
      } else {
        // A healthy in-progress case: nothing blocks closure, so nothing to draw attention to.
        return null;
      }

      return {
        rank,
        daysLeft: state.daysLeft,
        caseNumber: row.caseNumber,
        requesterName: row.requesterName,
        requestType: row.requestType,
        why,
        ownerName: row.ownerName,
        status: row.status,
      };
    });

  return items
    .filter((item): item is AttentionItem => item !== null)
    .sort((a, b) => a.rank - b.rank || a.daysLeft - b.daysLeft);
}

// ── Copy ─────────────────────────────────────────────────────────────────────

export const DASHBOARD_COPY = {
  title: "Dashboard",
  subtitle: (client: string, at: Date) => `${client} · today, ${formatDate(at)}`,
  /** Label, lucide icon, and the accent colour from the prototype's widget table. */
  widgets: [
    { label: "Open cases", icon: "inbox", color: "#0B1F3A" },
    { label: "Due within 7 days", icon: "clock", color: "#B54708" },
    { label: "Overdue", icon: "circle-alert", color: "#B42318" },
    { label: "Awaiting approval", icon: "lock", color: "#B54708" },
    { label: "High-risk verifications", icon: "shield-x", color: "#B42318" },
    { label: "Systems in Action required", icon: "triangle-alert", color: "#B54708" },
    { label: "Completed this month", icon: "circle-check", color: "#0E6B4D" },
    { label: "Average time to closure", icon: "timer", color: "#0B1F3A" },
  ] as const,
  attention: {
    title: "Needs attention",
    caption: "Ordered by what blocks closure first",
    emptyTitle: "Nothing needs attention",
    emptyBody: "New requests appear here when they need a decision.",
    columns: { case: "Case", action: "Next required action", status: "Status", owner: "Owner", sla: "SLA" },
    open: "Open case",
  },
  unassigned: "Unassigned",
} as const;

export function widgetValues(stats: CaseStats): (string | number)[] {
  return [
    stats.open,
    stats.dueSoon,
    stats.overdue,
    stats.awaitingApproval,
    stats.highRiskVerifications,
    stats.actionRequiredSystems,
    stats.completedThisMonth,
    stats.avgClosureDays === null ? "—" : `${stats.avgClosureDays} days`,
  ];
}
