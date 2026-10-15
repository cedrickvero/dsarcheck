import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth/require-auth";
import {
  assertDifferentActorDecidedAndApproved,
  assertHighRiskIsApproverOnly,
  assertNamedHumanActor,
  assertNoActionRequiredOutstanding,
  assertRequesterIsNotTheDecider,
  assertRetainedUnderExceptionReviewed,
  hasApproverRole,
} from "@/server/erasure/approval-gate";

const handler: Actor = {
  userId: "user-handler",
  label: "H. Handler",
  orgId: "org-1",
  workspaceId: "ws-1",
  roles: ["handler"],
};
const approver: Actor = { ...handler, userId: "user-approver", label: "A. Approver", roles: ["approver"] };

describe("named human actor (the no-autonomous-deletion enforcement point)", () => {
  it("refuses a missing actor", () => {
    expect(() => assertNamedHumanActor(null)).toThrow(/named human actor/);
    expect(() => assertNamedHumanActor(undefined)).toThrow(/named human actor/);
  });

  it("refuses an empty or whitespace actor id", () => {
    expect(() => assertNamedHumanActor({ ...handler, userId: "" })).toThrow(/named human actor/);
    expect(() => assertNamedHumanActor({ ...handler, userId: "   " })).toThrow(/named human actor/);
  });

  it("refuses a system/worker/cron actor outright - deletion is never autonomous", () => {
    for (const id of ["System", "system", "worker", "CRON", "scheduler", "job"]) {
      expect(() => assertNamedHumanActor({ ...handler, userId: id }), id).toThrow(
        /never decided autonomously/,
      );
    }
  });

  it("refuses a blank label, because the audit row needs a human attribution", () => {
    expect(() => assertNamedHumanActor({ ...handler, label: "  " })).toThrow(/actor label is empty/);
  });

  it("accepts a named human actor", () => {
    expect(() => assertNamedHumanActor(handler)).not.toThrow();
  });
});

describe("high-risk decisions are Approver-only", () => {
  it("refuses a non-approver on a high-risk decision", () => {
    expect(hasApproverRole(handler)).toBe(false);
    expect(() => assertHighRiskIsApproverOnly({ actor: handler, risk: "high" })).toThrow(
      /approver role required/i,
    );
  });

  it("allows an approver on a high-risk decision, and anyone on a standard one", () => {
    expect(() => assertHighRiskIsApproverOnly({ actor: approver, risk: "high" })).not.toThrow();
    expect(() => assertHighRiskIsApproverOnly({ actor: handler, risk: "standard" })).not.toThrow();
  });
});

describe("requester may never decide", () => {
  it("refuses when the actor IS the requester", () => {
    expect(() =>
      assertRequesterIsNotTheDecider({ actor: handler, requesterActorId: handler.userId }),
    ).toThrow(/requester cannot decide/i);
  });

  it("allows a different actor, and is silent when the requester is unknown", () => {
    expect(() =>
      assertRequesterIsNotTheDecider({ actor: handler, requesterActorId: "user-someone-else" }),
    ).not.toThrow();
    expect(() =>
      assertRequesterIsNotTheDecider({ actor: handler, requesterActorId: null }),
    ).not.toThrow();
  });
});

describe("separation of duties on high-risk decisions", () => {
  it("refuses the same actor deciding and approving a high-risk decision", () => {
    expect(() =>
      assertDifferentActorDecidedAndApproved({
        decidedBy: "user-1",
        approvedBy: "user-1",
        risk: "high",
      }),
    ).toThrow(/different actor to approve/i);
  });

  it("allows two different actors, is silent without an approver, and silent for standard risk", () => {
    expect(() =>
      assertDifferentActorDecidedAndApproved({ decidedBy: "u1", approvedBy: "u2", risk: "high" }),
    ).not.toThrow();
    expect(() =>
      assertDifferentActorDecidedAndApproved({ decidedBy: "u1", approvedBy: null, risk: "high" }),
    ).not.toThrow();
    expect(() =>
      assertDifferentActorDecidedAndApproved({ decidedBy: "u1", approvedBy: "u1", risk: "standard" }),
    ).not.toThrow();
  });
});

describe("Retained under exception requires approver review", () => {
  it("refuses a retained outcome with no approver review", () => {
    expect(() =>
      assertRetainedUnderExceptionReviewed({ outcome: "retained_under_exception", reviewedBy: null }),
    ).toThrow(/requires review by an Approver/);
    expect(() =>
      assertRetainedUnderExceptionReviewed({
        outcome: "retained_under_exception",
        reviewedBy: handler,
      }),
    ).toThrow(/requires review by an Approver/);
  });

  it("accepts an approver review, and does not constrain other outcomes", () => {
    expect(() =>
      assertRetainedUnderExceptionReviewed({ outcome: "retained_under_exception", reviewedBy: approver }),
    ).not.toThrow();
    expect(() =>
      assertRetainedUnderExceptionReviewed({ outcome: "deleted", reviewedBy: null }),
    ).not.toThrow();
  });
});

describe("Action required blocks approval", () => {
  it("refuses while any system is Action required", () => {
    expect(() =>
      assertNoActionRequiredOutstanding([{ systemRef: "s1", outcome: "action_required" }]),
    ).toThrow(/Action required/);
  });

  it("passes when nothing is Action required", () => {
    expect(() =>
      assertNoActionRequiredOutstanding([{ systemRef: "s1", outcome: "deleted" }]),
    ).not.toThrow();
  });
});
