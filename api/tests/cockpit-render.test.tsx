/**
 * Cockpit tab components, rendered to markup: the tab bar links carry the URL, the active
 * tab is announced, the Overview shows the requester's own words and a real progress figure,
 * and the audit table renders time as text (never colour-only).
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CockpitTabs, resolveCockpitTab } from "@/app/app/_components/cockpit-tabs";
import { OverviewTab } from "@/app/app/_components/overview-tab";
import { AuditTab } from "@/app/app/_components/audit-tab";
import { TabStub } from "@/app/app/_components/tab-stub";
import type { CaseOverview } from "@/server/cases/overview";
import type { CaseRow } from "@/server/cases/query";

const overview = (): CaseOverview => ({
  case: {
    id: "c1", orgId: "o1", workspaceId: "w1",
    caseNumber: "DSAR-2026-00418", requestType: "Access", priority: "Normal", status: "In progress",
    receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"),
    ownerId: null, requesterName: "Maya Lindqvist", requesterEmail: "maya@example.test",
    details: "I want a copy of everything you hold on me.", identifier: "cust-8821",
    extensionMonths: 0, risk: "Low", closedAt: null, createdAt: new Date("2026-09-24T00:00:00Z"),
  } as CaseRow,
  systemsDone: 2,
  systemsTotal: 3,
  systems: [
    { name: "Production database", status: "Completed", evidenceCount: 2 },
    { name: "Email archive", status: "Not started", evidenceCount: 0 },
    { name: "CRM", status: "Retained under exception", evidenceCount: 1 },
  ],
  inboundMessages: [],
});

describe("CockpitTabs", () => {
  it("links every tab through the URL and marks the active one", () => {
    const html = renderToStaticMarkup(
      <CockpitTabs active="overview" requestType="Access" systemsDone={2} systemsTotal={3} />,
    );
    expect(html).toContain('href="?tab=identity"');
    expect(html).toContain('href="?tab=audit"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Data-source checklist");
    expect(html).toContain("2/3");
  });

  it("labels the collection tab Erasure outcomes for an erasure request", () => {
    const html = renderToStaticMarkup(
      <CockpitTabs active="collection" requestType="Erasure" systemsDone={0} systemsTotal={7} />,
    );
    expect(html).toContain("Erasure outcomes");
    expect(html).not.toContain("Collection &amp; redaction");
  });
});

describe("resolveCockpitTab", () => {
  it("passes a known tab through unchanged", () => {
    expect(resolveCockpitTab("audit")).toBe("audit");
    expect(resolveCockpitTab("collection")).toBe("collection");
    expect(resolveCockpitTab("overview")).toBe("overview");
  });

  it("falls back to overview for unknown or missing tabs", () => {
    expect(resolveCockpitTab("nonsense")).toBe("overview");
    expect(resolveCockpitTab("")).toBe("overview");
    expect(resolveCockpitTab(undefined)).toBe("overview");
  });
});

describe("OverviewTab", () => {
  it("quotes the request and shows a real progress figure", () => {
    const html = renderToStaticMarkup(<OverviewTab overview={overview()} />);
    expect(html).toContain("Maya Lindqvist");
    expect(html).toContain("maya@example.test");
    expect(html).toContain("cust-8821");
    expect(html).toContain("Hosted intake form");
    expect(html).toContain("I want a copy of everything you hold on me.");
    expect(html).toContain("2 of 3 systems complete");
  });

  it("announces progress as an accessible progressbar", () => {
    const html = renderToStaticMarkup(<OverviewTab overview={overview()} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="2"');
    expect(html).toContain('aria-valuemax="3"');
  });
});

describe("AuditTab", () => {
  it("renders rows newest-first with a text timestamp", () => {
    const html = renderToStaticMarkup(
      <AuditTab
        events={[
          { at: new Date("2026-10-02T10:00:00Z"), actorLabel: "priya", action: "case.assigned", category: "cases", reason: "assign owner", objectId: "c1" },
          { at: new Date("2026-10-01T10:00:00Z"), actorLabel: "priya", action: "case.created", category: "cases", reason: "intake", objectId: "c1" },
        ]}
      />,
    );
    expect(html).toContain("Append-only");
    expect(html).toContain("case.assigned");
    expect(html).toContain("assign owner");
    expect(html).toContain("2 Oct 2026");
  });

  it("has a real empty state", () => {
    const html = renderToStaticMarkup(<AuditTab events={[]} />);
    expect(html).toContain("No recorded actions yet.");
  });
});

describe("TabStub", () => {
  it("renders an honest placeholder", () => {
    const html = renderToStaticMarkup(<TabStub title="Identity" body="A later slice." />);
    expect(html).toContain("Identity");
    expect(html).toContain("A later slice.");
  });
});
