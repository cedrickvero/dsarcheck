/**
 * The evidence-pack components, rendered to markup: the version list, the generate/
 * regenerate button, the empty state, and the document sections.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceTab } from "@/app/app/_components/evidence-tab";
import type { EvidenceView } from "@/server/cases/evidence";

const noop = async () => ({ ok: true });

const view = (): EvidenceView => ({
  caseId: "c1",
  requestType: "Access",
  versions: [
    { id: "pack-1", version: 1, draft: true, generatedBy: null, generatedAt: new Date("2026-10-06T15:00:00Z") },
    { id: "pack-2", version: 2, draft: false, generatedBy: null, generatedAt: new Date("2026-10-06T16:00:00Z") },
  ],
  latest: {
    caseNumber: "DSAR-2026-00418",
    clientName: "Lumen Analytics",
    draft: false,
    generatedAt: "6 Oct 2026, 16:00",
    sections: [
      { title: "Request details", pairs: [{ label: "Requester", value: "Maya <maya@x.se>" }] },
      { title: "Systems searched", pairs: [], table: { columns: ["System", "Owner", "Result", "Evidence"], rows: [["Production database", "Priya", "Completed", "—"]] } },
      { title: "Final status", pairs: [{ label: "Status", value: "Completed" }] },
    ],
  },
});

describe("EvidenceTab", () => {
  it("renders the version list and the document sections", () => {
    const html = renderToStaticMarkup(
      <EvidenceTab caseId="c1" caseNumber="DSAR-2026-00418" view={view()} canGenerate={true} action={noop} />,
    );
    expect(html).toContain("Regenerate pack");
    expect(html).toContain("v1");
    expect(html).toContain("v2");
    expect(html).toContain("Final");
    expect(html).toContain("1. Request details");
    expect(html).toContain("2. Systems searched");
    expect(html).toContain("Production database");
  });

  it("shows the empty state when no version exists", () => {
    const empty = { ...view(), versions: [], latest: null };
    const html = renderToStaticMarkup(<EvidenceTab caseId="c1" caseNumber="X" view={empty} canGenerate={true} action={noop} />);
    expect(html).toContain("No pack generated yet. A draft can be generated at any time; the final pack is created on approval.");
    expect(html).toContain("Generate evidence pack");
  });
});
