import { describe, expect, it } from "vitest";
import { checks, remainingLabel, type PreClosureCheckId } from "@/domain/checks";
import { mkCase, nth, system, systems } from "./domain-case";

/**
 * Six gates. Each case below breaks exactly one of them, so a red test names its
 * own cause. Erasure and non-erasure diverge on check 4.
 */
const run = (overrides: Parameters<typeof mkCase>[0] = {}) => checks(mkCase(overrides));
const byId = (overrides: Parameters<typeof mkCase>[0], id: PreClosureCheckId) =>
  nth(
    run(overrides).items.filter((item) => item.id === id),
    0,
  );

describe("checks()", () => {
  it("passes every gate on a clean case, in the documented order", () => {
    const result = run();
    expect(result.items.map((i) => i.id)).toEqual(["id", "sys", "ev", "red", "tpl", "exc"]);
    expect(result.items.map((i) => i.label)).toEqual([
      "Identity verified",
      "All systems searched",
      "Evidence attached",
      "Redaction reviewed",
      "Response template selected",
      "Exceptions documented",
    ]);
    expect(result.allPass).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.identityVerified).toBe(true);
    expect(result.allSystemsSearched).toBe(true);
    expect(result.evidenceAttached).toBe(true);
    expect(result.workResolved).toBe(true);
    expect(result.templateSelected).toBe(true);
    expect(result.exceptionsDocumented).toBe(true);
  });

  it("fails identity with 'pending' copy, and names the decider when verified", () => {
    const pending = run({ idVerified: false, idDecision: null });
    const id = nth(pending.items, 0);
    expect(id.satisfied).toBe(false);
    expect(id.detail).toBe("Identity decision pending");
    expect(id.tab).toBe("identity");
    expect(pending.allPass).toBe(false);

    expect(nth(run().items, 0).detail).toBe("Decision recorded by Priya Shah");
  });

  it("counts open systems, including Action required on a non-erasure case", () => {
    const oneOpen = run({
      systems: [system("pg", "In progress", { evidence: [] }), ...systems().slice(1)],
    });
    expect(nth(oneOpen.items, 1).satisfied).toBe(false);
    expect(nth(oneOpen.items, 1).detail).toBe("1 of 7 systems still open");

    // Action required is unfinished work for an access request…
    const access = run({ systems: [system("pg", "Action required"), ...systems().slice(1)] });
    expect(nth(access.items, 1).satisfied).toBe(false);
    expect(nth(access.items, 1).detail).toBe("1 of 7 systems still open");

    // …and for an erasure case Action required is NOT counted as "open": the
    // erasure work check reports it instead, so the two do not double-count.
    const erasure = run({
      type: "Erasure",
      systems: [system("pg", "Action required"), ...systems().slice(1)],
    });
    expect(nth(erasure.items, 1).satisfied).toBe(true);
    const er = byId({ type: "Erasure", systems: [system("pg", "Action required"), ...systems().slice(1)] }, "er");
    expect(er.satisfied).toBe(false);
    expect(er.detail).toBe("1 system requires action");
  });

  it("pluralises the erasure action count", () => {
    const er = byId(
      {
        type: "Erasure",
        systems: [
          system("pg", "Action required"),
          system("stripe", "Action required"),
          ...systems().slice(2),
        ],
      },
      "er",
    );
    expect(er.detail).toBe("2 systems require action");
  });

  it("requires evidence on every Completed and Retained system", () => {
    const missing = byId(
      { systems: [system("pg", "Completed", { evidence: [] }), ...systems().slice(1)] },
      "ev",
    );
    expect(missing.satisfied).toBe(false);
    expect(missing.detail).toBe("1 systems missing evidence");

    const retained = byId(
      {
        systems: [
          system("pg", "Retained under exception", {
            evidence: [],
            reason: "Tax",
            exceptionCategory: "Legal obligation — tax and accounting",
          }),
          ...systems().slice(1),
        ],
      },
      "ev",
    );
    expect(retained.satisfied).toBe(false);
  });

  it("does not require evidence on a Not found system", () => {
    const result = run({
      systems: [system("hubspot", "Not found", { reason: "No records." }), ...systems().slice(1)],
    });
    expect(result.evidenceAttached).toBe(true);
    expect(result.allSystemsSearched).toBe(true);
  });

  it("passes redaction when no file needs it", () => {
    const result = run({ redactionReview: "none", finalExportDone: false, tokens: [] });
    expect(byId({ redactionReview: "none", finalExportDone: false, tokens: [] }, "red").detail).toBe(
      "No files require redaction",
    );
    expect(result.workResolved).toBe(true);
  });

  it("walks the redaction ladder: unredacted → not requested → requested → not exported", () => {
    const tokens = [
      { flagged: true, redacted: false },
      { flagged: true, redacted: false },
    ];
    expect(byId({ tokens }, "red").detail).toBe("2 flagged items not yet redacted");

    expect(
      byId(
        { tokens: [{ flagged: true, redacted: true }], redactionReview: "none", finalExportDone: false },
        "red",
      ).detail,
    ).toBe("Review not requested");

    expect(
      byId(
        {
          tokens: [{ flagged: true, redacted: true }],
          redactionReview: "requested",
          finalExportDone: false,
        },
        "red",
      ).detail,
    ).toBe("Review requested, not completed");

    expect(
      byId(
        {
          tokens: [{ flagged: true, redacted: true }],
          redactionReview: "done",
          finalExportDone: false,
        },
        "red",
      ).detail,
    ).toBe("Final redacted export not generated");

    expect(run({ tokens: [{ flagged: true, redacted: true }] }).workResolved).toBe(true);
    // Unflagged tokens are not redaction work.
    expect(run({ tokens: [{ flagged: false, redacted: false }] }).workResolved).toBe(true);
  });

  it("fails when no response template is selected", () => {
    const tpl = byId({ template: null }, "tpl");
    expect(tpl.satisfied).toBe(false);
    expect(tpl.detail).toBe("No template selected");
    expect(tpl.tab).toBe("approval");
  });

  it("requires both a reason and a category on every retained system", () => {
    const reasonOnly = byId(
      {
        systems: [
          system("stripe", "Retained under exception", { reason: "Statutory accounting." }),
          ...systems().slice(1),
        ],
      },
      "exc",
    );
    expect(reasonOnly.satisfied).toBe(false);
    expect(reasonOnly.detail).toBe("1 retention exception with reason");

    const both = byId(
      {
        systems: [
          system("stripe", "Retained under exception", {
            reason: "Statutory accounting.",
            exceptionCategory: "Legal obligation — tax and accounting",
          }),
          ...systems().slice(1),
        ],
      },
      "exc",
    );
    expect(both.satisfied).toBe(true);

    const two = byId(
      {
        systems: [
          system("stripe", "Retained under exception", { reason: "Tax" }),
          system("pg", "Retained under exception", { reason: "Claims" }),
          ...systems().slice(2),
        ],
      },
      "exc",
    );
    expect(two.detail).toBe("2 retention exceptions with reason");
  });

  it("routes the erasure work check to the erasure tab and the rest to the checklist", () => {
    const erasure = run({ type: "Erasure" });
    expect(erasure.items.find((i) => i.id === "red")).toBeUndefined();
    expect(byId({ type: "Erasure" }, "exc").tab).toBe("work");
    expect(erasure.workResolved).toBe(true);

    const access = run({ type: "Access" });
    expect(access.items.find((i) => i.id === "er")).toBeUndefined();
    expect(byId({ type: "Access" }, "exc").tab).toBe("checklist");
  });

  it("reports every blocker so the CTA can say how many remain", () => {
    const result = run({
      idVerified: false,
      template: null,
      systems: [system("pg", "In progress"), ...systems().slice(1)],
    });
    expect(result.blockers.map((b) => b.id)).toEqual(["id", "sys", "tpl"]);
    expect(remainingLabel(result.blockers.length)).toBe("3 items remain");
    expect(remainingLabel(1)).toBe("1 item remains");
  });
});
