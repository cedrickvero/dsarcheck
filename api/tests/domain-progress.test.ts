import { describe, expect, it } from "vitest";
import { progress, steps } from "@/domain/progress";
import { checks } from "@/domain/checks";
import { mkCase, nth, system, systems } from "./domain-case";
import type { CaseStatus } from "@/domain/types";

const statuses = (list: string[]) => list.map((s, i) => system(`s${i}`, s as never));

describe("progress()", () => {
  it("counts Completed, Not found and Retained as done", () => {
    const result = progress(statuses(["Completed", "Not found", "Retained under exception"]));
    expect(result).toEqual({ done: 3, total: 3, label: "3 of 3", pct: 100 });
  });

  it("does not count in-flight or action-required rows", () => {
    const result = progress(
      statuses(["Completed", "In progress", "Not started", "Action required"]),
    );
    expect(result.done).toBe(1);
    expect(result.label).toBe("1 of 4");
    expect(result.pct).toBe(25);
  });

  it("reports the prototype's 7-system case", () => {
    // 'ccfcini' → Completed, Completed, Not found, Completed, In progress, Not started, In progress
    const seven = progress(
      statuses([
        "Completed",
        "Completed",
        "Not found",
        "Completed",
        "In progress",
        "Not started",
        "In progress",
      ]),
    );
    expect(seven).toEqual({ done: 4, total: 7, label: "4 of 7", pct: 57 });
  });

  it("survives a case with no systems instead of dividing by zero", () => {
    expect(progress([])).toEqual({ done: 0, total: 0, label: "0 of 0", pct: 0 });
  });
});

describe("steps()", () => {
  const base = (status: CaseStatus = "In progress") => ({
    type: "Access" as const,
    status,
    idVerified: true,
    checks: checks(mkCase({ status })),
    packCount: 0,
  });

  it("returns six labelled steps in order", () => {
    const result = steps(base());
    expect(result).toHaveLength(6);
    expect(result.map((s) => s.label)).toEqual([
      "Received",
      "Identity",
      "Checklist",
      "Collection & redaction",
      "Approval",
      "Evidence pack",
    ]);
    expect(result.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.map((s) => s.tab)).toEqual([
      "overview",
      "identity",
      "checklist",
      "work",
      "approval",
      "evidence",
    ]);
  });

  it("names step 4 by request type", () => {
    expect(nth(steps({ ...base(), type: "Erasure" }), 3).label).toBe("Erasure outcomes");
    expect(nth(steps({ ...base(), type: "Access" }), 3).label).toBe(
      "Collection & redaction",
    );
  });

  it("marks the first unfinished step as current, the rest as not started", () => {
    const result = steps(base());
    expect(nth(result, 0).state).toBe("complete");
    expect(nth(result, 1).state).toBe("complete");
    expect(nth(result, 2).state).toBe("complete");
    expect(nth(result, 3).state).toBe("complete");
    expect(nth(result, 4).state).toBe("current step");
    expect(nth(result, 4).done).toBe(false);
    expect(nth(result, 5).state).toBe("not started");
  });

  it("stops at Identity when identity is unverified, without un-completing later work", () => {
    const result = steps({ ...base(), idVerified: false });
    expect(nth(result, 1).state).toBe("current step");
    // Done-states are independent of position, exactly as the prototype has them:
    // a case can have its checklist finished while identity is still pending.
    expect(nth(result, 2).state).toBe("complete");
    expect(nth(result, 2).done).toBe(true);
  });

  it("needs both checklist checks before step 3 completes", () => {
    const missingEvidence = mkCase({
      systems: [system("pg", "Completed", { evidence: [] }), ...systems().slice(1)],
    });
    const result = steps({ ...base(), checks: checks(missingEvidence) });
    expect(nth(result, 2).done).toBe(false);
    expect(nth(result, 2).state).toBe("current step");
  });

  it("completes every step for a closed case with a pack", () => {
    const closed = mkCase({ status: "Completed", packs: 1 });
    const result = steps({
      type: "Access",
      status: "Completed",
      idVerified: true,
      checks: checks(closed),
      packCount: 1,
    });
    expect(result.every((s) => s.done)).toBe(true);
    expect(result.every((s) => s.state === "complete")).toBe(true);
  });

  it("leaves the evidence step open when a closed case has no pack", () => {
    const result = steps({
      type: "Access",
      status: "Completed",
      idVerified: true,
      checks: checks(mkCase({ status: "Completed" })),
      packCount: 0,
    });
    expect(nth(result, 4).done).toBe(true);
    expect(nth(result, 5).done).toBe(false);
    expect(nth(result, 5).state).toBe("current step");
  });

  it("has no current step for a rejected case", () => {
    const rejected = mkCase({ status: "Rejected" });
    const result = steps({
      type: "Access",
      status: "Rejected",
      idVerified: false,
      checks: checks(rejected),
      packCount: 0,
    });
    expect(result.some((s) => s.state === "current step")).toBe(false);
    expect(result.filter((s) => s.state === "not started").length).toBeGreaterThan(0);
  });
});
