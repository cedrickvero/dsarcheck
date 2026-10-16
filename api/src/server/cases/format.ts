/**
 * Presentation of case data.
 *
 * Dates follow the non-negotiables exactly: "13 Oct 2026" and "13 Oct 2026, 10:42", 24
 * hour, stored UTC. Formatting happens in an EXPLICIT timezone rather than the server's
 * local one, because a server-locale accident would silently shift every displayed date.
 * Europe/Berlin is docs/04's workspace default.
 *
 * Status is returned as a LABEL plus a non-colour marker. The non-negotiables require
 * that status is never conveyed by colour alone, so the UI always has text to render and
 * cannot accidentally depend on a hue.
 */
import type { CaseRow } from "./query";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WORKSPACE_TIMEZONE = "Europe/Berlin";

function parts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return {
    d: Number(out.day), m: Number(out.month), y: Number(out.year),
    h: out.hour === "24" ? 0 : Number(out.hour), min: Number(out.minute),
  };
}

export function formatDate(date: Date, timeZone: string = WORKSPACE_TIMEZONE): string {
  const { d, m, y } = parts(date, timeZone);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatDateTime(date: Date, timeZone: string = WORKSPACE_TIMEZONE): string {
  const { d, m, y, h, min } = parts(date, timeZone);
  return `${d} ${MONTHS[m - 1]} ${y}, ${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export type DeadlineState = "overdue" | "due-today" | "due-soon" | "on-track";

/** Deadline state as TEXT plus a machine-readable key - never a colour on its own. */
export function deadlineState(due: Date, at: Date, warnDays = 5): { state: DeadlineState; label: string } {
  const ms = due.getTime() - at.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (ms < 0) return { state: "overdue", label: `Overdue by ${Math.abs(days)} day(s)` };
  if (days === 0) return { state: "due-today", label: "Due today" };
  return { state: days <= warnDays ? "due-soon" : "on-track", label: `Due in ${days} day(s)` };
}

export interface CaseSummary {
  caseNumber: string;
  requestType: CaseRow["requestType"];
  status: CaseRow["status"];
  /** Always rendered as text, so status survives with colour removed. */
  statusLabel: string;
  priority: CaseRow["priority"];
  received: string;
  due: string;
  deadline: { state: DeadlineState; label: string };
}

export function summarise(row: CaseRow, at: Date, timeZone: string = WORKSPACE_TIMEZONE): CaseSummary {
  return {
    caseNumber: row.caseNumber,
    requestType: row.requestType,
    status: row.status,
    statusLabel: row.status,
    priority: row.priority,
    received: formatDate(row.receivedAt, timeZone),
    due: formatDate(row.statutoryDueAt, timeZone),
    deadline: deadlineState(row.statutoryDueAt, at),
  };
}
