/**
 * The agency dashboard component, rendered to markup: the eight KPI tiles and the client
 * workspaces table.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgencyDashboard } from "@/app/app/_components/agency-dashboard";
import type { AgencyDashboard as AgencyDashboardData } from "@/server/cases/agency";

const data = (): AgencyDashboardData => ({
  orgName: "Northlight Privacy",
  totalOpen: 3,
  dueSoon: 1,
  overdue: 2,
  awaitingApproval: 1,
  actionRequired: 1,
  highRisk: 1,
  completedThisMonth: 1,
  avgClosureDays: 10.6,
  clients: [
    {
      workspaceId: "w1", name: "Fernwood & Co", open: 2, dueSoon: 1, overdue: 1, awaitingApproval: 0,
      actionRequired: 1, highRisk: 1, completedThisMonth: 0, avgClosureDays: 9.5,
      nextDeadline: { caseNumber: "DSAR-2026-00117", dueAt: new Date("2026-10-24T00:00:00Z") },
    },
    {
      workspaceId: "w2", name: "Kesto Health", open: 1, dueSoon: 0, overdue: 1, awaitingApproval: 1,
      actionRequired: 0, highRisk: 0, completedThisMonth: 1, avgClosureDays: 11.0,
      nextDeadline: null,
    },
  ],
});

describe("AgencyDashboard", () => {
  it("renders the KPI tiles and the client table", () => {
    const html = renderToStaticMarkup(<AgencyDashboard data={data()} at={new Date("2026-10-13T10:00:00Z")} />);
    expect(html).toContain("Agency dashboard");
    expect(html).toContain("all client workspaces");
    expect(html).toContain("Open cases");
    expect(html).toContain("Due within 7 days");
    expect(html).toContain("High-risk verifications");
    expect(html).toContain("Client workspaces");
    expect(html).toContain("Fernwood &amp; Co");
    expect(html).toContain("Kesto Health");
    expect(html).toContain("DSAR-2026-00117");
  });
});
