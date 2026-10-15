import type { SlaRisk } from "./types";

export interface SlaInput {
  dueAt: Date;
  now: Date;
}

export interface SlaState {
  daysLeft: number;
  /** Final user-facing copy. Must match the prototype verbatim. */
  label: string;
  risk: SlaRisk;
  /** 0..1 elapsed fraction of the SLA window, for the thin progress bar. */
  progress: number;
}

/**
 * SLA countdown (docs/03 § SLA indicator, docs/05).
 *
 * TODO(domain slice): port sla() verbatim from
 * `design/reference/seed/workspace-seed.js`, then cover every branch — overdue
 * by 1 day vs N days, due today, 1 day left, more than 7 days. Wording such as
 * "Overdue by N day(s)" is final copy.
 */
export function sla(_input: SlaInput): SlaState {
  throw new Error("sla() not implemented — port from design/reference/seed/workspace-seed.js");
}
