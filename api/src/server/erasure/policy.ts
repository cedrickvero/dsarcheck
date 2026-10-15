/**
 * Erasure/retention policy: categories, evidence requirements, and the pre-closure rules.
 *
 * Sources of record, quoted rather than paraphrased:
 *  - design/docs/04-data-model.md defines ExceptionCategory verbatim - the list below is
 *    that union, and it is NOT ours to invent or extend.
 *  - design/docs/05-workflows-and-rules.md: "Retention requires a documented exception. It
 *    appears in the evidence pack and must be reviewed by the approver." (#6 "Exceptions
 *    documented - every Retained system has reason AND exception category".)
 *  - design/docs/05: "A case cannot enter approval if any system remains in Action required."
 *
 * Pure functions only: no I/O, no clock, no randomness, so every rule is exhaustively
 * testable and cannot silently depend on the environment.
 *
 * Server-only.
 */
import { ValidationError } from "@/server/http/errors";
import { isErasureOutcome, outcomeRule, type ErasureOutcome } from "./outcomes";

/** design/docs/04-data-model.md, verbatim. */
export const RETENTION_EXCEPTION_CATEGORIES = [
  "Legal obligation — tax and accounting",
  "Establishment or defence of legal claims",
  "Fraud prevention",
  "Other documented exception",
] as const;

export type RetentionExceptionCategory = (typeof RETENTION_EXCEPTION_CATEGORIES)[number];

export function isRetentionExceptionCategory(value: unknown): value is RetentionExceptionCategory {
  return (
    typeof value === "string" &&
    (RETENTION_EXCEPTION_CATEGORIES as readonly string[]).includes(value)
  );
}

/** A system's erasure state, as far as the contract is concerned. */
export interface SystemOutcomeState {
  /** Stable reference to the data source / system. */
  readonly systemRef: string;
  /** null = no outcome recorded yet. */
  readonly outcome: ErasureOutcome | null;
  readonly exceptionCategory?: string | null;
  readonly evidenceRef?: string | null;
  /** True when the system auto-attached an outcome record (docs/05: outcome ≠ Action required). */
  readonly hasOutcomeRecord?: boolean;
}

/**
 * The evidence rule (docs/05): Deleted, Suppressed/anonymized, Retained under exception and
 * Not found require evidence OR an automatically attached outcome record. Action required
 * is the unresolved state and claims neither.
 */
export function evidenceRequirementSatisfied(state: {
  outcome: ErasureOutcome;
  evidenceRef?: string | null;
  hasOutcomeRecord?: boolean;
}): boolean {
  const rule = outcomeRule(state.outcome);
  if (!rule.requiresEvidenceOrOutcomeRecord) return true;
  const hasEvidence = typeof state.evidenceRef === "string" && state.evidenceRef.trim() !== "";
  return hasEvidence || state.hasOutcomeRecord === true;
}

/** Systems still blocking the case. docs/05: "cannot enter approval if any ... Action required". */
export function systemsBlockingApproval(
  systems: readonly SystemOutcomeState[],
): readonly SystemOutcomeState[] {
  return systems.filter((s) => s.outcome !== null && outcomeRule(s.outcome).blocksCaseApproval);
}

/** Systems with no outcome recorded at all are open work, not blockers, but they are not "resolved" either. */
export function systemsWithoutOutcome(
  systems: readonly SystemOutcomeState[],
): readonly SystemOutcomeState[] {
  return systems.filter((s) => s.outcome === null);
}

/** docs/05 #6: every Retained system must carry both a reason and an exception category. */
export function systemsMissingDocumentedException(
  systems: readonly SystemOutcomeState[],
): readonly SystemOutcomeState[] {
  return systems.filter(
    (s) =>
      s.outcome === "retained_under_exception" &&
      !isRetentionExceptionCategory(s.exceptionCategory ?? null),
  );
}

/**
 * The erasure pre-closure check (docs/05 § "Pre-closure checks"): "Erasure outcomes
 * resolved - no Action required and none open."
 */
export function assertErasurePreClosurePasses(systems: readonly SystemOutcomeState[]): void {
  const undecided = systemsWithoutOutcome(systems);
  if (undecided.length > 0) {
    throw new ValidationError(
      `${undecided.length} system(s) have no erasure outcome recorded yet`,
    );
  }
  const blocking = systemsBlockingApproval(systems);
  if (blocking.length > 0) {
    // The spec's own banner wording (docs/03 § E4b).
    throw new ValidationError(
      `${blocking.length} system(s) is/are in Action required. The case cannot enter approval until it is/they are resolved.`,
    );
  }
  const undocumented = systemsMissingDocumentedException(systems);
  if (undocumented.length > 0) {
    throw new ValidationError(
      `${undocumented.length} retained system(s) lack a documented exception category`,
    );
  }
  for (const system of systems) {
    // Bound to a local so the type guard narrows reliably.
    const outcome = system.outcome;
    if (!isErasureOutcome(outcome)) {
      throw new ValidationError(`system ${system.systemRef} has an invalid erasure outcome`);
    }
    if (
      !evidenceRequirementSatisfied({
        outcome,
        evidenceRef: system.evidenceRef,
        hasOutcomeRecord: system.hasOutcomeRecord,
      })
    ) {
      throw new ValidationError(
        `system ${system.systemRef} requires evidence or an attached outcome record for outcome "${outcomeRule(outcome).label}"`,
      );
    }
  }
}
