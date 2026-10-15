/**
 * Case progress derivation (docs/03 stepper).
 *
 * TODO(domain slice): port progress() and steps() from
 * `design/reference/seed/workspace-seed.js`. Pure — takes case state, returns
 * the stepper position. Unit-test every branch.
 */
export interface ProgressState {
  stepIndex: number;
  totalSteps: number;
}

export function progress(_caseLike: unknown): ProgressState {
  throw new Error("progress() not implemented — port from design/reference/seed/workspace-seed.js");
}
