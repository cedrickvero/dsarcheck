/**
 * Checklist progress and the case-header stepper — ported from `progress()` and
 * the `stepsDef` block of the cockpit renderer in
 * `design/reference/logic/workspace-logic.js`.
 *
 * Pure. Erasure cases get "Erasure outcomes" for step 4; every other type gets
 * "Collection & redaction".
 */
import type { PreClosureChecks } from "./checks";
import type { CaseStatus } from "./types";

export interface ProgressState {
  done: number;
  total: number;
  /** `5 of 7` — final copy. */
  label: string;
  pct: number;
}

/** `Not found` counts as searched: the prototype treats it as done. */
const DONE_STATUSES = new Set(["Completed", "Not found", "Retained under exception"]);

export function progress(systems: { status: string }[]): ProgressState {
  const done = systems.filter((s) => DONE_STATUSES.has(s.status)).length;
  const total = systems.length;
  // A case with no systems has nothing outstanding; guard rather than emit NaN.
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, label: `${done} of ${total}`, pct };
}

export interface StepperInput {
  type: string;
  status: CaseStatus;
  idVerified: boolean;
  checks: PreClosureChecks;
  packCount: number;
}

export type StepState = "complete" | "current step" | "not started";

export interface Step {
  label: string;
  /** 1-based position, used for the circle number. */
  n: number;
  done: boolean;
  state: StepState;
  /** The cockpit tab this step opens. */
  tab: string;
}

/**
 * Six steps: Received · Identity · Checklist · work · Approval · Evidence pack.
 * The current step is the first unfinished one; a Rejected case has none.
 */
export function steps(input: StepperInput): Step[] {
  const workLabel =
    input.type === "Erasure" ? "Erasure outcomes" : "Collection & redaction";

  const defs: { label: string; done: boolean; tab: string }[] = [
    { label: "Received", done: true, tab: "overview" },
    { label: "Identity", done: input.idVerified, tab: "identity" },
    {
      label: "Checklist",
      done: input.checks.allSystemsSearched && input.checks.evidenceAttached,
      tab: "checklist",
    },
    { label: workLabel, done: input.checks.workResolved, tab: "work" },
    { label: "Approval", done: input.status === "Completed", tab: "approval" },
    {
      label: "Evidence pack",
      done: input.status === "Completed" && input.packCount > 0,
      tab: "evidence",
    },
  ];

  const currentIndex =
    input.status === "Rejected" ? -1 : defs.findIndex((d) => !d.done);

  return defs.map((def, i) => ({
    label: def.label,
    n: i + 1,
    done: def.done,
    state: def.done ? "complete" : i === currentIndex ? "current step" : "not started",
    tab: def.tab,
  }));
}
