import { describe, expect, it } from "vitest";
import { ValidationError } from "@/server/http/errors";
import {
  RETENTION_EXCEPTION_CATEGORIES,
  assertErasurePreClosurePasses,
  evidenceRequirementSatisfied,
  isRetentionExceptionCategory,
  systemsBlockingApproval,
  systemsMissingDocumentedException,
  type SystemOutcomeState,
} from "@/server/erasure/policy";

function sys(over: Partial<SystemOutcomeState> & { systemRef: string }): SystemOutcomeState {
  return { outcome: "deleted", evidenceRef: "ev.pdf", ...over };
}

describe("retention exception categories (spec verbatim)", () => {
  it("is exactly the four categories from design/docs/04-data-model.md", () => {
    expect(RETENTION_EXCEPTION_CATEGORIES).toEqual([
      "Legal obligation — tax and accounting",
      "Establishment or defence of legal claims",
      "Fraud prevention",
      "Other documented exception",
    ]);
  });

  it("accepts the four and rejects anything else (an invented category must not pass)", () => {
    for (const ok of RETENTION_EXCEPTION_CATEGORIES) expect(isRetentionExceptionCategory(ok)).toBe(true);
    for (const bad of ["tax", "LEGAL OBLIGATION — TAX AND ACCOUNTING", "", null, "Other"]) {
      expect(isRetentionExceptionCategory(bad), String(bad)).toBe(false);
    }
  });
});

describe("evidence requirement", () => {
  it("is satisfied by evidence OR an attached outcome record, for the four closing outcomes", () => {
    for (const outcome of ["deleted", "suppressed", "retained_under_exception", "not_found"] as const) {
      expect(evidenceRequirementSatisfied({ outcome, evidenceRef: "ev.pdf" })).toBe(true);
      expect(evidenceRequirementSatisfied({ outcome, hasOutcomeRecord: true })).toBe(true);
      expect(evidenceRequirementSatisfied({ outcome, evidenceRef: "   " })).toBe(false);
      expect(evidenceRequirementSatisfied({ outcome })).toBe(false);
    }
  });

  it("does not apply to Action required, which claims neither evidence nor a record", () => {
    expect(evidenceRequirementSatisfied({ outcome: "action_required" })).toBe(true);
  });
});

describe("pre-closure rule: no Action required open", () => {
  it("blocks a case while any system is Action required", () => {
    const systems = [sys({ systemRef: "s1" }), sys({ systemRef: "s2", outcome: "action_required" })];
    expect(systemsBlockingApproval(systems).map((s) => s.systemRef)).toEqual(["s2"]);
    expect(() => assertErasurePreClosurePasses(systems)).toThrow(/Action required/);
  });

  it("passes when every system is resolved with evidence", () => {
    const systems = [
      sys({ systemRef: "s1" }),
      sys({ systemRef: "s2", outcome: "not_found" }),
      sys({ systemRef: "s3", outcome: "suppressed" }),
    ];
    expect(() => assertErasurePreClosurePasses(systems)).not.toThrow();
  });

  it("treats a system with no outcome as open work, not as resolved", () => {
    const systems = [sys({ systemRef: "s1", outcome: null })];
    expect(() => assertErasurePreClosurePasses(systems)).toThrow(/no erasure outcome recorded/);
  });

  it("requires a documented exception category on every retained system", () => {
    const missing = [sys({ systemRef: "s1", outcome: "retained_under_exception", evidenceRef: "e.pdf" })];
    expect(systemsMissingDocumentedException(missing).map((s) => s.systemRef)).toEqual(["s1"]);
    expect(() => assertErasurePreClosurePasses(missing)).toThrow(/documented exception category/);

    const documented = [
      sys({
        systemRef: "s1",
        outcome: "retained_under_exception",
        evidenceRef: "e.pdf",
        exceptionCategory: "Fraud prevention",
      }),
    ];
    expect(() => assertErasurePreClosurePasses(documented)).not.toThrow();
  });

  it("requires evidence or a record before a system counts as resolved", () => {
    const systems = [sys({ systemRef: "s1", evidenceRef: null, hasOutcomeRecord: false })];
    expect(() => assertErasurePreClosurePasses(systems)).toThrow(ValidationError);
  });
});
