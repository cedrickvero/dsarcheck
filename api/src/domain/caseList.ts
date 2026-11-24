/**
 * The case list: saved views, filters, ordering and the copy around them — ported from
 * the prototype's case-list block (`renderVals()` in
 * `design/reference/logic/workspace-logic.js`) and docs/03 § C.
 *
 * Pure. The rows are already tenant-scoped and authorized by the caller; this decides
 * what a given viewer sees, in what order, and what the screen says about it.
 */
import { formatDate } from "./dates";
import { sla } from "./sla";
import type { CaseStatus, RequestType } from "./types";

export interface CaseListRow {
  caseNumber: string;
  requestType: RequestType;
  status: CaseStatus;
  priority: "Normal" | "High";
  /** Null renders as "Unassigned": T-07 predated owners, so old rows have none. */
  ownerId: string | null;
  ownerName: string | null;
  requesterName: string;
  requesterEmail: string;
  receivedAt: Date;
  /**
   * The stored statutory deadline. The SLA indicator derives the same date from
   * `receivedAt + 1 month + extension`; both must agree, which `cases-schema` and the
   * parity suite keep honest.
   */
  dueAt: Date;
  extensionMonths: 0 | 1 | 2;
  checklistDone: number;
  checklistTotal: number;
}

export interface ViewerContext {
  /**
   * The signed-in user's id. "My cases" matches on the id, not on a name: names are not
   * unique, and two people called the same thing must not see each other's queue.
   */
  viewerId: string;
  now: Date;
}

// ── Saved views ──────────────────────────────────────────────────────────────

export const CASE_VIEWS = [
  { key: "all", label: "All open" },
  { key: "mine", label: "My cases" },
  { key: "due", label: "Due soon" },
  { key: "approval", label: "Awaiting approval" },
  { key: "overdue", label: "Overdue" },
  { key: "closed", label: "Closed" },
] as const;

export type CaseViewKey = (typeof CASE_VIEWS)[number]["key"];

const DUE_SOON_DAYS = 7;

/**
 * The six predicates, transcribed. Note what they are NOT: "Awaiting approval" ignores
 * the SLA entirely, so an overdue case awaiting sign-off appears in both views - which is
 * correct, because the two views answer different questions ("who owes a decision" vs
 * "what is late").
 */
export function matchesView(row: CaseListRow, view: CaseViewKey, ctx: ViewerContext): boolean {
  const state = sla({
    status: row.status,
    receivedAt: row.receivedAt,
    extensionMonths: row.extensionMonths,
    closedAt: null,
    now: ctx.now,
  });

  switch (view) {
    case "all":
      return state.open;
    case "mine":
      return state.open && row.ownerId === ctx.viewerId;
    case "due":
      return state.open && state.daysLeft >= 0 && state.daysLeft <= DUE_SOON_DAYS;
    case "approval":
      return row.status === "Awaiting approval";
    case "overdue":
      return state.open && state.daysLeft < 0;
    case "closed":
      return !state.open;
  }
}

export function viewCounts(
  rows: readonly CaseListRow[],
  ctx: ViewerContext,
): Record<CaseViewKey, number> {
  const counts = { all: 0, mine: 0, due: 0, approval: 0, overdue: 0, closed: 0 };
  for (const row of rows) {
    for (const view of CASE_VIEWS) {
      if (matchesView(row, view.key, ctx)) counts[view.key] += 1;
    }
  }
  return counts;
}

// ── Filters ──────────────────────────────────────────────────────────────────

export interface CaseListFilters {
  view: CaseViewKey;
  /** Free text: case ID, requester name or email. */
  q: string;
  type: "All" | RequestType;
  status: "All" | CaseStatus;
}

export const FILTER_TYPES = [
  "All",
  "Access",
  "Erasure",
  "Portability",
  "Rectification",
  "Objection",
] as const;

export const FILTER_STATUSES = [
  "All",
  "New",
  "Verifying",
  "In progress",
  "Awaiting approval",
  "Completed",
  "Extended",
  "Rejected",
] as const;

export const DEFAULT_FILTERS: CaseListFilters = {
  view: "all",
  q: "",
  type: "All",
  status: "All",
};

/**
 * Tolerant on purpose. The filters live in the URL, so anyone can hand-edit them: an
 * unknown view falls back to "All open" rather than rendering an empty list, and a junk
 * type falls back to "All". A 400 for a mistyped link would be hostile and would make a
 * stale bookmark look broken.
 */
export function parseFilters(raw: Record<string, string | string[] | undefined>): CaseListFilters {
  const one = (value: string | string[] | undefined): string =>
    (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

  const view = one(raw.view) as CaseViewKey;
  const type = one(raw.type);
  const status = one(raw.status);

  return {
    view: CASE_VIEWS.some((v) => v.key === view) ? view : DEFAULT_FILTERS.view,
    q: one(raw.q).slice(0, 120),
    type: (FILTER_TYPES as readonly string[]).includes(type)
      ? (type as CaseListFilters["type"])
      : "All",
    status: (FILTER_STATUSES as readonly string[]).includes(status)
      ? (status as CaseListFilters["status"])
      : "All",
  };
}

/** The URL for a filter state, so the view survives a refresh and can be shared. */
export function filtersToQuery(filters: CaseListFilters): string {
  const params = new URLSearchParams();
  if (filters.view !== DEFAULT_FILTERS.view) params.set("view", filters.view);
  if (filters.q) params.set("q", filters.q);
  if (filters.type !== "All") params.set("type", filters.type);
  if (filters.status !== "All") params.set("status", filters.status);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Search, view and filters, then the prototype's sort: nearest deadline first, ties by
 * case number so the order is stable between renders.
 *
 * The search covers exactly the three fields docs/03 lists - ID, name, email - and is
 * case-insensitive. It deliberately does NOT search details or notes: those hold
 * personal data that the list has no reason to expose.
 */
export function filterRows(
  rows: readonly CaseListRow[],
  filters: CaseListFilters,
  ctx: ViewerContext,
): CaseListRow[] {
  const q = filters.q.trim().toLowerCase();

  return rows
    .filter((row) => matchesView(row, filters.view, ctx))
    .filter((row) => filters.type === "All" || row.requestType === filters.type)
    .filter((row) => filters.status === "All" || row.status === filters.status)
    .filter(
      (row) =>
        q === "" ||
        row.caseNumber.toLowerCase().includes(q) ||
        row.requesterName.toLowerCase().includes(q) ||
        row.requesterEmail.toLowerCase().includes(q),
    )
    .slice()
    .sort((a, b) => {
      const left = daysLeft(a, ctx);
      const right = daysLeft(b, ctx);
      if (left !== right) return left - right;
      return a.caseNumber.localeCompare(b.caseNumber);
    });
}

export function daysLeft(row: CaseListRow, ctx: ViewerContext): number {
  return sla({
    status: row.status,
    receivedAt: row.receivedAt,
    extensionMonths: row.extensionMonths,
    closedAt: null,
    now: ctx.now,
  }).daysLeft;
}

// ── Copy ─────────────────────────────────────────────────────────────────────

/** Every visible string on the screen, from docs/03 § C and the prototype. */
export const CASE_LIST_COPY = {
  title: "Cases",
  subtitle: (client: string) => `${client} · sorted by deadline, nearest first`,
  intakeLink: "Open public intake form",
  searchPlaceholder: "Search case ID, name or email",
  searchLabel: "Search cases",
  typeLabel: "Type",
  statusLabel: "Status",
  clearFilters: "Clear filters",
  bulk: {
    selected: (n: number) => `${n} selected`,
    assign: "Assign owner",
    exportCsv: "Export selected",
    clear: "Clear",
    assignTitle: (n: number) => `Assign owner to ${n} ${n === 1 ? "case" : "cases"}`,
    assignDescription: "Each case records the reassignment in its audit log.",
    assignConfirm: "Assign owner",
    assignOptionLabel: "New owner",
    reasonLabel: "Reason",
    reasonPlaceholder: "e.g. Rebalancing queue for annual leave",
    assigned: (n: number, owner: string) =>
      `${n} ${n === 1 ? "case" : "cases"} assigned to ${owner}.`,
    exported: (n: number) =>
      `${n} ${n === 1 ? "case" : "cases"} exported to CSV. Export logged on each case.`,
  },
  empty: {
    title: "No cases in this view",
    body:
      "New requests from the intake form appear in All open. Approved requests appear here " +
      "before final response and evidence export.",
  },
  columns: {
    case: "Case ID",
    requester: "Requester",
    type: "Type",
    status: "Status",
    owner: "Owner",
    received: "Received",
    sla: "SLA",
    checklist: "Checklist",
    priority: "Priority",
  },
  unassigned: "Unassigned",
  checklist: (done: number, total: number) => `${done} of ${total}`,
} as const;

// ── CSV ──────────────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  "Case ID",
  "Requester",
  "Email",
  "Type",
  "Status",
  "Owner",
  "Received",
  "Deadline",
  "Days left",
  "Priority",
] as const;

/** RFC 4180: quote when the value contains a comma, quote, CR or LF; double the quotes. */
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly CaseListRow[], ctx: ViewerContext): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) {
    const left = daysLeft(row, ctx);
    lines.push(
      [
        row.caseNumber,
        row.requesterName,
        row.requesterEmail,
        row.requestType,
        row.status,
        row.ownerName ?? CASE_LIST_COPY.unassigned,
        formatDate(row.receivedAt),
        formatDate(row.dueAt),
        String(left),
        row.priority,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
