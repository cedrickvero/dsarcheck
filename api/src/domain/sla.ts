/**
 * SLA countdown — ported verbatim from `sla()` in
 * `design/reference/seed/workspace-seed.js` (labels in docs/02 § SLA indicator).
 *
 * Deadline = received + 1 month + extension months. Every label below is final
 * copy: "Overdue by N day(s)", "Due today", "N day(s) left", "Closed 2 Oct".
 *
 * Pure: the caller supplies `now` (see `clock.ts`), so tests are deterministic.
 */
import { addMonthsUtc, dayWord, diffInDays, formatDate, formatDateShort } from "./dates";
import type { CaseStatus, SlaRisk } from "./types";

export interface SlaInput {
  status: CaseStatus;
  receivedAt: Date;
  extensionMonths?: 0 | 1 | 2;
  closedAt?: Date | null;
  now: Date;
}

export interface SlaState {
  /** Final user-facing copy. */
  label: string;
  risk: SlaRisk;
  /** Text colour (design-system token). */
  fg: string;
  /** Pill background (design-system token). */
  bg: string;
  /** Thin progress-bar colour (design-system token). */
  bar: string;
  /** Lucide icon name, without the `icon-` prefix. */
  icon: string;
  /** Days from `now` to the deadline; negative when overdue. 999 when closed. */
  daysLeft: number;
  /** 0..100, clamped to a minimum of 4 so the bar is always visible. */
  pct: number;
  /** `13 Nov 2026` — an em dash when the case is closed. */
  deadline: string;
  /** `13 Nov` */
  deadlineShort: string;
  /** `24 Sep 2026` */
  received: string;
  open: boolean;
}

const CLOSED: Pick<SlaState, "fg" | "bg" | "bar" | "icon" | "risk"> = {
  fg: "#475467",
  bg: "#EEF1F4",
  bar: "#98A2B3",
  icon: "circle-check",
  risk: "Closed",
};

export function sla(input: SlaInput): SlaState {
  const { status, receivedAt, now } = input;
  const extensionMonths = input.extensionMonths ?? 0;

  if (status === "Completed" || status === "Rejected") {
    const label = input.closedAt ? `Closed ${formatDateShort(input.closedAt)}` : "Closed";
    return {
      ...CLOSED,
      label,
      daysLeft: 999,
      pct: 100,
      deadline: "—",
      deadlineShort: "—",
      received: formatDate(receivedAt),
      open: false,
    };
  }

  const deadlineDate = addMonthsUtc(receivedAt, 1 + extensionMonths);
  const daysLeft = diffInDays(now, deadlineDate);
  const total = diffInDays(receivedAt, deadlineDate);
  // total is at least 28 days for any real month, so this cannot divide by zero;
  // guard anyway rather than emit NaN into a progress bar.
  const elapsed = total === 0 ? 0 : (total - Math.max(daysLeft, 0)) / total;
  const pct = Math.min(100, Math.max(4, Math.round(elapsed * 100)));

  const common = {
    deadline: formatDate(deadlineDate),
    deadlineShort: formatDateShort(deadlineDate),
    received: formatDate(receivedAt),
    open: true,
    daysLeft,
    pct: daysLeft < 0 ? 100 : pct,
  };

  if (daysLeft < 0) {
    return {
      ...common,
      label: `Overdue by ${-daysLeft} ${dayWord(-daysLeft)}`,
      risk: "Overdue",
      fg: "#B42318",
      bg: "#FEE4E2",
      bar: "#B42318",
      icon: "circle-alert",
    };
  }

  if (daysLeft === 0) {
    return {
      ...common,
      label: "Due today",
      risk: "Strong warning",
      fg: "#B54708",
      bg: "#FDF0DC",
      bar: "#B54708",
      icon: "triangle-alert",
    };
  }

  if (daysLeft <= 7) {
    return {
      ...common,
      label: `${daysLeft} ${dayWord(daysLeft)} left`,
      risk: "Due soon",
      fg: "#B54708",
      bg: "#FDF0DC",
      bar: "#DC6803",
      icon: "clock",
    };
  }

  return {
    ...common,
    label: `${daysLeft} days left`,
    risk: extensionMonths > 0 ? "Extended" : "On track",
    fg: "#344054",
    bg: "#EEF1F4",
    bar: "#0E7C7B",
    icon: "clock",
  };
}

/** Screen-reader label: "SLA {label}, {risk}". */
export function slaAriaLabel(state: SlaState): string {
  return `SLA ${state.label}, ${state.risk}`;
}
