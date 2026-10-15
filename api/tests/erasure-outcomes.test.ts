import { describe, expect, it } from "vitest";
import {
  ERASURE_OUTCOMES,
  OUTCOME_RULES,
  isErasureOutcome,
  outcomeRule,
  outcomesInBoardOrder,
} from "@/server/erasure/outcomes";

/**
 * The frozen five-outcome contract (design/docs/03 § E4b). These are the spec's labels,
 * verbatim, because they appear on the product surface and in the evidence pack.
 */
describe("erasure outcome contract", () => {
  it("has exactly the five outcomes of record, in board order", () => {
    expect(ERASURE_OUTCOMES).toEqual([
      "deleted",
      "suppressed",
      "retained_under_exception",
      "not_found",
      "action_required",
    ]);
    expect(outcomesInBoardOrder().map((r) => r.label)).toEqual([
      "Deleted",
      "Suppressed / anonymized",
      "Retained under exception",
      "Not found",
      "Action required",
    ]);
  });

  it("accepts each of the five outcomes", () => {
    for (const outcome of ERASURE_OUTCOMES) {
      expect(isErasureOutcome(outcome), outcome).toBe(true);
      expect(outcomeRule(outcome).outcome).toBe(outcome);
    }
  });

  it("rejects anything that is not one of the five", () => {
    for (const bad of ["Deleted", "deleted ", "purged", "anonymized", "", null, undefined, 7, {}]) {
      expect(isErasureOutcome(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("defines every rule for every outcome (no outcome may omit a rule)", () => {
    const required = [
      "requiresExceptionCategory",
      "requiresEvidenceOrOutcomeRecord",
      "requiresApproverReview",
      "satisfiesChecklistItem",
      "blocksCaseApproval",
    ] as const;
    for (const outcome of ERASURE_OUTCOMES) {
      const rule = OUTCOME_RULES[outcome] as unknown as Record<string, unknown>;
      for (const key of required) {
        expect(typeof rule[key], `${outcome}.${key}`).toBe("boolean");
      }
      expect(Object.keys(OUTCOME_RULES).length).toBe(5);
    }
  });

  it("keeps Action required as the only non-closing, approval-blocking outcome", () => {
    for (const outcome of ERASURE_OUTCOMES) {
      const rule = outcomeRule(outcome);
      if (outcome === "action_required") {
        expect(rule.blocksCaseApproval).toBe(true);
        expect(rule.satisfiesChecklistItem).toBe(false);
      } else {
        expect(rule.blocksCaseApproval, `${outcome} must not block approval`).toBe(false);
        expect(rule.satisfiesChecklistItem, `${outcome} must close its checklist item`).toBe(true);
      }
    }
  });

  it("requires a category and approver review only for Retained under exception", () => {
    for (const outcome of ERASURE_OUTCOMES) {
      const rule = outcomeRule(outcome);
      const isRetained = outcome === "retained_under_exception";
      expect(rule.requiresExceptionCategory, outcome).toBe(isRetained);
      expect(rule.requiresApproverReview, outcome).toBe(isRetained);
    }
  });
});
