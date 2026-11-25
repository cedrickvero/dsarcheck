/**
 * The erasure outcomes components, rendered to markup: the board shows each system's
 * outcome (label) and reason as text, and the form offers the five outcomes with the
 * exception category revealed only for "Retained under exception".
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ErasureTab } from "@/app/app/_components/erasure-tab";
import { ErasureOutcomeForm } from "@/app/app/_components/erasure-outcome-form";
import type { ErasureView } from "@/server/cases/erasure";

const noop = async () => ({ ok: true });

const view = (): ErasureView => ({
  caseId: "c1",
  requestType: "Erasure",
  risk: "Low",
  systems: [
    { sourceKey: "db", name: "Production database", outcome: "deleted", outcomeLabel: "Deleted", outcomeAt: new Date("2026-10-02T10:00:00Z"), reason: "rows hard-deleted", exceptionCategory: null, ownerName: "Priya Shah" },
    { sourceKey: "stripe", name: "Stripe", outcome: null, outcomeLabel: null, outcomeAt: null, reason: "", exceptionCategory: null, ownerName: null },
  ],
});

describe("ErasureTab", () => {
  it("shows each system's outcome label and reason", () => {
    const html = renderToStaticMarkup(
      <ErasureTab caseId="c1" caseNumber="DSAR-2026-00412" view={view()} action={noop} />,
    );
    expect(html).toContain("Deleted");
    expect(html).toContain("rows hard-deleted");
    expect(html).toContain("Not recorded");
    expect(html).toContain("Record an outcome for each system.");
  });
});

describe("ErasureOutcomeForm", () => {
  const base = { caseId: "c1", caseNumber: "X", sourceKey: "db", currentOutcome: null, exceptionCategories: ["Legal obligation — tax and accounting", "Fraud prevention"] };

  it("offers all five outcomes and a reason", () => {
    const html = renderToStaticMarkup(<ErasureOutcomeForm {...base} action={noop} />);
    expect(html).toContain("Deleted");
    expect(html).toContain("Suppressed / anonymized");
    expect(html).toContain("Action required");
    expect(html).toContain("Reason (required)");
    expect(html).toContain("Outcome record attached");
  });

  it("reveals the exception category only for retained_under_exception", () => {
    const retained = renderToStaticMarkup(<ErasureOutcomeForm {...base} currentOutcome="retained_under_exception" action={noop} />);
    expect(retained).toContain("Exception category");
    const deleted = renderToStaticMarkup(<ErasureOutcomeForm {...base} currentOutcome="deleted" action={noop} />);
    expect(deleted).not.toContain("Exception category");
  });
});
