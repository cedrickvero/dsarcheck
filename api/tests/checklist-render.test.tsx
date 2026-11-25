/**
 * The checklist tab components, rendered to markup: the grid carries the source, search
 * method, owner, evidence and reason as text, and the status form exposes the six statuses
 * plus the exception-category select only when the current status is "Retained under
 * exception".
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChecklistTab } from "@/app/app/_components/checklist-tab";
import { SystemStatusForm } from "@/app/app/_components/system-status-form";
import type { ChecklistSystemRow } from "@/server/cases/checklist";

const noop = async () => ({ ok: true });

const systems: ChecklistSystemRow[] = [
  { sourceKey: "db", name: "Production database", status: "Not started", evidenceCount: 0, searchMethod: "Export by email", reason: "", exceptionCategory: null, dueAt: new Date("2026-10-20T00:00:00Z"), ownerName: "Priya Shah", updatedAt: new Date() },
  { sourceKey: "zendesk", name: "Zendesk", status: "Completed", evidenceCount: 2, searchMethod: "Search tickets", reason: "tickets attached", exceptionCategory: null, dueAt: null, ownerName: null, updatedAt: new Date() },
];

describe("ChecklistTab", () => {
  it("renders the grid with owner, evidence, reason and progress", () => {
    const html = renderToStaticMarkup(
      <ChecklistTab caseId="c1" caseNumber="DSAR-2026-00418" deadline={new Date("2026-10-24T00:00:00Z")} systems={systems} action={noop} />,
    );
    expect(html).toContain("1 of 2 systems complete");
    expect(html).toContain("Production database");
    expect(html).toContain("Export by email");
    expect(html).toContain("Priya Shah");
    expect(html).toContain("2 files");
    expect(html).toContain("None");
    expect(html).toContain("tickets attached");
  });

  it("has an empty state", () => {
    const html = renderToStaticMarkup(
      <ChecklistTab caseId="c1" caseNumber="X" deadline={new Date()} systems={[]} action={noop} />,
    );
    expect(html).toContain("No data sources recorded for this case.");
  });
});

describe("SystemStatusForm", () => {
  const base = {
    caseId: "c1", caseNumber: "DSAR-2026-00418", sourceKey: "db",
    exceptionCategories: ["A", "B"],
  };

  it("offers all six statuses and a reason field", () => {
    const html = renderToStaticMarkup(<SystemStatusForm {...base} currentStatus="In progress" action={noop} />);
    expect(html).toContain("Not started");
    expect(html).toContain("Completed");
    expect(html).toContain("Action required");
    expect(html).toContain("Reason (required)");
    expect(html).toContain(">Update<");
  });

  it("shows the exception-category select only when the current status is Retained", () => {
    const retained = renderToStaticMarkup(<SystemStatusForm {...base} currentStatus="Retained under exception" action={noop} />);
    expect(retained).toContain("Exception category");
    const inProgress = renderToStaticMarkup(<SystemStatusForm {...base} currentStatus="In progress" action={noop} />);
    expect(inProgress).not.toContain("Exception category");
  });
});
