/**
 * The frozen five-outcome erasure contract.
 *
 * Source of record: design/docs/03-screens.md § E4b ("Erasure outcomes" - the five
 * columns) and design/docs/05-workflows-and-rules.md § "Erasure outcome rules". The
 * labels below are the spec's wording, verbatim, because they appear in the product
 * surface and in the evidence pack.
 *
 * R4 is a CONTRACT: nothing here deletes, suppresses, anonymizes or purges anything.
 * An outcome is a human decision about what happened to one data source. Persisting it
 * waits for the data-source/system entity and the migration that creates it - see
 * docs/qa/R4 notes. Until then the immutable audit event IS the record of the decision.
 *
 * Server-only: never import this into a client component.
 */

export const ERASURE_OUTCOMES = [
  "deleted",
  "suppressed",
  "retained_under_exception",
  "not_found",
  "action_required",
] as const;

export type ErasureOutcome = (typeof ERASURE_OUTCOMES)[number];

export interface OutcomeRule {
  readonly outcome: ErasureOutcome;
  /** The spec's label, verbatim (docs/03 § E4b). */
  readonly label: string;
  /** "Retained also requires exception category" (docs/05). */
  readonly requiresExceptionCategory: boolean;
  /** Deleted / Suppressed / Retained / Not found need evidence or an outcome record. */
  readonly requiresEvidenceOrOutcomeRecord: boolean;
  /** "must be reviewed by the approver" (docs/05). */
  readonly requiresApproverReview: boolean;
  /** "Action required does not close a system checklist item." */
  readonly satisfiesChecklistItem: boolean;
  /** "A case cannot enter approval if any system remains in Action required." */
  readonly blocksCaseApproval: boolean;
}

/**
 * The rules, one per outcome. Deliberately explicit and total: every outcome carries all
 * five rules so a new outcome cannot be added without answering each question.
 */
export const OUTCOME_RULES: Readonly<Record<ErasureOutcome, OutcomeRule>> = Object.freeze({
  deleted: {
    outcome: "deleted",
    label: "Deleted",
    requiresExceptionCategory: false,
    requiresEvidenceOrOutcomeRecord: true,
    requiresApproverReview: false,
    satisfiesChecklistItem: true,
    blocksCaseApproval: false,
  },
  suppressed: {
    outcome: "suppressed",
    label: "Suppressed / anonymized",
    requiresExceptionCategory: false,
    requiresEvidenceOrOutcomeRecord: true,
    requiresApproverReview: false,
    satisfiesChecklistItem: true,
    blocksCaseApproval: false,
  },
  retained_under_exception: {
    outcome: "retained_under_exception",
    label: "Retained under exception",
    requiresExceptionCategory: true,
    requiresEvidenceOrOutcomeRecord: true,
    requiresApproverReview: true,
    satisfiesChecklistItem: true,
    blocksCaseApproval: false,
  },
  not_found: {
    outcome: "not_found",
    label: "Not found",
    requiresExceptionCategory: false,
    requiresEvidenceOrOutcomeRecord: true,
    requiresApproverReview: false,
    satisfiesChecklistItem: true,
    blocksCaseApproval: false,
  },
  action_required: {
    outcome: "action_required",
    label: "Action required",
    requiresExceptionCategory: false,
    // Action required is the "not yet resolved" state: it may not claim evidence, and it
    // is the one outcome that neither closes a checklist item nor lets the case proceed.
    requiresEvidenceOrOutcomeRecord: false,
    requiresApproverReview: false,
    satisfiesChecklistItem: false,
    blocksCaseApproval: true,
  },
});

export function isErasureOutcome(value: unknown): value is ErasureOutcome {
  return typeof value === "string" && (ERASURE_OUTCOMES as readonly string[]).includes(value);
}

export function outcomeRule(outcome: ErasureOutcome): OutcomeRule {
  return OUTCOME_RULES[outcome];
}

/** Outcomes in the spec's column order, for surfaces that render the board. */
export function outcomesInBoardOrder(): readonly OutcomeRule[] {
  return ERASURE_OUTCOMES.map((o) => OUTCOME_RULES[o]);
}
