import { describe, expect, it } from "vitest";
import {
  attentionItems,
  caseStats,
  DASHBOARD_COPY,
  widgetValues,
  type DashboardRow,
} from "@/domain/dashboard";
import type { CaseListRow } from "@/domain/caseList";

const NOW = new Date(Date.UTC(2026, 9, 13, 10, 42));
const day = (d: number) => new Date(Date.UTC(2026, 8, d));

function row(over: Partial<DashboardRow> & { caseNumber: string }): DashboardRow {
  return {
    requestType: "Access",
    status: "In progress",
    priority: "Normal",
    risk: "Low",
    ownerId: "u-priya",
    ownerName: "Priya Shah",
    requesterName: "Maya Lindqvist",
    requesterEmail: "maya@example.test",
    receivedAt: day(24),
    dueAt: new Date(Date.UTC(2026, 9, 24)),
    extensionMonths: 0,
    checklistDone: 4,
    checklistTotal: 7,
    actionRequired: 0,
    closedAt: null,
    approverName: "Daniel Okafor",
    ...over,
  };
}

const ROWS: DashboardRow[] = [
  row({ caseNumber: "DSAR-2026-00405", receivedAt: day(11) }), // overdue -2, rk0
  row({ caseNumber: "DSAR-2026-00412", receivedAt: day(20), status: "Awaiting approval" }), // rk1
  row({ caseNumber: "DSAR-2026-00420", status: "New", risk: "High" }), // rk2
  row({ caseNumber: "DSAR-2026-00421", receivedAt: day(19), actionRequired: 2 }), // rk3
  row({ caseNumber: "DSAR-2026-00422", receivedAt: day(17) }), // 4 left, rk4
  row({ caseNumber: "DSAR-2026-00423", status: "Verifying" }), // 11 left, rk5
  row({ caseNumber: "DSAR-2026-00424" }), // healthy, excluded
  row({
    caseNumber: "DSAR-2026-00390",
    status: "Completed",
    closedAt: new Date(Date.UTC(2026, 9, 3)),
    receivedAt: day(1),
  }), // closed this month
];

describe("caseStats()", () => {
  it("counts the eight tiles the way the prototype does", () => {
    const stats = caseStats(ROWS, NOW);
    expect(stats).toMatchObject({
      open: 7, // everything but the Completed one
      dueSoon: 3, // 7 (awaiting), 6 (action-required), 4 (rk4)
      overdue: 1,
      awaitingApproval: 1,
      highRiskVerifications: 1,
      actionRequiredSystems: 2,
      completedThisMonth: 1,
    });
  });

  it("averages time-to-closure over COMPLETED cases only, to one decimal", () => {
    // One completion: 3 Oct - 1 Sep = 32 days.
    const stats = caseStats(ROWS, NOW);
    expect(stats.avgClosureDays).toBe(32);

    // A Rejected case is closed but is not a completion: it must not drag the average.
    const withRejected = caseStats(
      [
        ...ROWS,
        row({
          caseNumber: "DSAR-2026-00391",
          status: "Rejected",
          receivedAt: day(2),
          closedAt: new Date(Date.UTC(2026, 9, 4)),
        }),
      ],
      NOW,
    );
    expect(withRejected.avgClosureDays).toBe(32);
  });

  it("reports no average when nothing has closed", () => {
    expect(caseStats([row({ caseNumber: "DSAR-2026-00430" })], NOW).avgClosureDays).toBeNull();
    expect(widgetValues(caseStats([row({ caseNumber: "DSAR-2026-00430" })], NOW))[7]).toBe("—");
  });

  it("counts completed-this-month by closedAt, and Rejected never counts as completed", () => {
    const closedLastMonth = row({
      caseNumber: "DSAR-2026-00388",
      status: "Completed",
      closedAt: new Date(Date.UTC(2026, 8, 20)),
    });
    expect(caseStats([closedLastMonth], NOW).completedThisMonth).toBe(0);

    const rejectedThisMonth = row({
      caseNumber: "DSAR-2026-00387",
      status: "Rejected",
      closedAt: new Date(Date.UTC(2026, 9, 5)),
    });
    expect(caseStats([rejectedThisMonth], NOW).completedThisMonth).toBe(0);
  });

  it("buckets 'this month' in the workspace timezone, not the server's UTC", () => {
    // 31 Oct 23:00 UTC is already 1 Nov in Europe/Berlin (CEST, UTC+2).
    const late = row({
      caseNumber: "DSAR-2026-00389",
      status: "Completed",
      receivedAt: day(5),
      closedAt: new Date(Date.UTC(2026, 9, 31, 23, 0)),
    });
    expect(caseStats([late], NOW, "UTC").completedThisMonth).toBe(1);
    expect(caseStats([late], NOW, "Europe/Berlin").completedThisMonth).toBe(0);
  });

  it("orders the widget values to match the fixed label list", () => {
    const values = widgetValues(caseStats(ROWS, NOW));
    expect(DASHBOARD_COPY.widgets.map((w) => w.label)).toEqual([
      "Open cases",
      "Due within 7 days",
      "Overdue",
      "Awaiting approval",
      "High-risk verifications",
      "Systems in Action required",
      "Completed this month",
      "Average time to closure",
    ]);
    expect(values).toEqual([7, 3, 1, 1, 1, 2, 1, "32 days"]);
  });
});

describe("attentionItems()", () => {
  it("ranks by the product rule and breaks ties by days left", () => {
    const items = attentionItems(ROWS, NOW);
    expect(items.map((i) => i.why)).toEqual([
      "Statutory deadline passed",
      "Awaiting approval by Daniel Okafor",
      "High-risk identity check",
      "2 systems in Action required",
      "Due within 7 days",
      "Identity verification pending",
    ]);
    expect(items.map((i) => i.caseNumber)).toEqual([
      "DSAR-2026-00405",
      "DSAR-2026-00412",
      "DSAR-2026-00420",
      "DSAR-2026-00421",
      "DSAR-2026-00422",
      "DSAR-2026-00423",
    ]);
    // A healthy in-progress case is not in the list at all.
    expect(items.some((i) => i.caseNumber === "DSAR-2026-00424")).toBe(false);
  });

  it("singularises the Action required reason", () => {
    const items = attentionItems(
      [row({ caseNumber: "DSAR-2026-00425", receivedAt: day(19), actionRequired: 1 })],
      NOW,
    );
    expect(items[0]?.why).toBe("1 system in Action required");
  });

  it("uses a fallback approver name when none is supplied", () => {
    const items = attentionItems(
      [row({ caseNumber: "DSAR-2026-00426", status: "Awaiting approval", approverName: "an approver" })],
      NOW,
    );
    expect(items[0]?.why).toBe("Awaiting approval by an approver");
  });

  it("sorts same-rank ties by days left ascending", () => {
    const items = attentionItems(
      [
        row({ caseNumber: "DSAR-2026-00427", receivedAt: day(12) }), // overdue -1
        row({ caseNumber: "DSAR-2026-00428", receivedAt: day(5) }), // overdue -8
      ],
      NOW,
    );
    expect(items.map((i) => i.caseNumber)).toEqual(["DSAR-2026-00428", "DSAR-2026-00427"]);
  });
});

describe("copy", () => {
  it("keeps the prototype's dashboard strings verbatim", () => {
    expect(DASHBOARD_COPY.title).toBe("Dashboard");
    expect(DASHBOARD_COPY.subtitle("Lumen Analytics", NOW)).toBe(
      "Lumen Analytics · today, 13 Oct 2026",
    );
    expect(DASHBOARD_COPY.attention.title).toBe("Needs attention");
    expect(DASHBOARD_COPY.attention.caption).toBe("Ordered by what blocks closure first");
    expect(DASHBOARD_COPY.attention.emptyTitle).toBe("Nothing needs attention");
    expect(DASHBOARD_COPY.attention.emptyBody).toBe(
      "New requests appear here when they need a decision.",
    );
    expect(DASHBOARD_COPY.attention.open).toBe("Open case");
  });
});
