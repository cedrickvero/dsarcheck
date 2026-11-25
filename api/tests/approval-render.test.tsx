/**
 * The approval tab components, rendered to markup: the pre-closure checklist shows each
 * item and its detail, the response preview renders, the history is text, and the form
 * exposes the right action for the status (send vs decide).
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApprovalTab } from "@/app/app/_components/approval-tab";
import { ApprovalForm } from "@/app/app/_components/approval-form";
import type { ApprovalView } from "@/server/cases/approval";

const noop = async () => ({ ok: true });

const view = (over: Partial<ApprovalView> = {}): ApprovalView => ({
  caseId: "c1",
  status: "In progress",
  template: "Access — copy of your personal data",
  checks: {
    items: [
      { id: "id", label: "Identity verified", satisfied: true, detail: "Decision recorded by Priya Shah", tab: "identity" },
      { id: "sys", label: "All systems searched", satisfied: false, detail: "1 of 3 systems still open", tab: "checklist" },
    ],
    identityVerified: true,
    allSystemsSearched: false,
    evidenceAttached: true,
    workResolved: true,
    templateSelected: true,
    exceptionsDocumented: true,
    allPass: false,
    blockers: [{ id: "sys", label: "All systems searched", satisfied: false, detail: "1 of 3 systems still open", tab: "checklist" }],
  },
  responsePreview: "Dear Maya,\n\nWe have completed your request.",
  history: [
    { action: "Sent for approval", by: "Priya Shah", at: new Date("2026-10-06T09:20:00Z"), reason: "ready for review" },
  ],
  canSendForApproval: true,
  canDecideClosure: false,
  ...over,
});

const actions = {
  selectTemplate: noop,
  sendForApproval: noop,
  approveAndClose: noop,
  requestChanges: noop,
  rejectCase: noop,
};

describe("ApprovalTab", () => {
  it("shows each pre-closure check with its detail and a View link", () => {
    const html = renderToStaticMarkup(<ApprovalTab caseId="c1" caseNumber="DSAR-2026-00418" view={view()} actions={actions} />);
    expect(html).toContain("Identity verified");
    expect(html).toContain("Decision recorded by Priya Shah");
    expect(html).toContain("All systems searched");
    expect(html).toContain("1 of 3 systems still open");
    expect(html).toContain('href="?tab=checklist"');
  });

  it("renders the response preview and the append-only history", () => {
    const html = renderToStaticMarkup(<ApprovalTab caseId="c1" caseNumber="X" view={view()} actions={actions} />);
    expect(html).toContain("We have completed your request.");
    expect(html).toContain("Sent for approval");
    expect(html).toContain("ready for review");
    expect(html).toContain("Automatic sending is off");
  });

  it("notes that closure is blocked when a check fails", () => {
    const html = renderToStaticMarkup(<ApprovalTab caseId="c1" caseNumber="X" view={view()} actions={actions} />);
    expect(html).toContain("Closure is blocked");
  });
});

describe("ApprovalForm", () => {
  const base = { caseId: "c1", caseNumber: "X", template: "", templates: ["Access — copy", "Refusal — documented reason"], canSend: true, canDecide: false, actions };

  it("offers send-for-approval while in progress", () => {
    const html = renderToStaticMarkup(<ApprovalForm {...base} status="In progress" />);
    expect(html).toContain("Send for approval");
    expect(html).toContain("Response template");
  });

  it("offers the three approver decisions while awaiting approval", () => {
    const html = renderToStaticMarkup(<ApprovalForm {...base} status="Awaiting approval" canSend={false} canDecide />);
    expect(html).toContain("Approve and close");
    expect(html).toContain("Request changes");
    expect(html).toContain(">Reject<");
  });

  it("shows no transition actions on a completed case", () => {
    const html = renderToStaticMarkup(<ApprovalForm {...base} status="Completed" />);
    expect(html).not.toContain("Send for approval");
    expect(html).not.toContain("Approve and close");
  });
});
