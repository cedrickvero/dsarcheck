import { describe, expect, it } from "vitest";
import { sla, slaAriaLabel } from "@/domain/sla";
import { NOW, RECEIVED, mkCase } from "./domain-case";
import type { CaseStatus } from "@/domain/types";

/**
 * Every branch of the SLA indicator, with the numbers the prototype produces at
 * NOW = 13 Oct 2026. These labels are final copy (docs/02 § SLA indicator), so a
 * change here is a copy change, not a refactor.
 */
function at(receivedAt: Date, overrides: Partial<Parameters<typeof sla>[0]> = {}) {
  return sla({
    status: "In progress" as CaseStatus,
    receivedAt,
    extensionMonths: 0,
    closedAt: null,
    now: NOW,
    ...overrides,
  });
}

const days = (n: number) => new Date(Date.UTC(2026, 8, n));

describe("sla()", () => {
  it("is on track with more than 7 days left, and counts days to the deadline", () => {
    // 24 Sep + 1 month = 24 Oct; from 13 Oct that is 11 days, of a 30-day window.
    const state = at(RECEIVED);
    expect(state.label).toBe("11 days left");
    expect(state.risk).toBe("On track");
    expect(state.daysLeft).toBe(11);
    expect(state.pct).toBe(63);
    expect(state.open).toBe(true);
    expect(state.deadline).toBe("24 Oct 2026");
    expect(state.deadlineShort).toBe("24 Oct");
    expect(state.received).toBe("24 Sep 2026");
    expect(state.icon).toBe("clock");
    expect(state.fg).toBe("#344054");
  });

  it("is due soon at exactly 7 days, and singularises 1 day", () => {
    const seven = at(days(20)); // 20 Oct deadline
    expect(seven.daysLeft).toBe(7);
    expect(seven.label).toBe("7 days left");
    expect(seven.risk).toBe("Due soon");
    expect(seven.bar).toBe("#DC6803");

    const one = at(days(14));
    expect(one.daysLeft).toBe(1);
    expect(one.label).toBe("1 day left");
    expect(one.risk).toBe("Due soon");
  });

  it("is due today at zero days", () => {
    const state = at(days(13));
    expect(state.label).toBe("Due today");
    expect(state.risk).toBe("Strong warning");
    expect(state.icon).toBe("triangle-alert");
    // Nothing remains of the window, so the bar is full.
    expect(state.pct).toBe(100);
  });

  it("is overdue by one day, and pluralises beyond that", () => {
    const one = at(days(12));
    expect(one.daysLeft).toBe(-1);
    expect(one.label).toBe("Overdue by 1 day");
    expect(one.risk).toBe("Overdue");
    expect(one.pct).toBe(100);

    const two = at(days(11));
    expect(two.label).toBe("Overdue by 2 days");
  });

  it("reports Extended when an extension is applied, with the later deadline", () => {
    // 5 Sep + 3 months (1 + 2) = 5 Dec.
    const state = sla({
      status: "Extended",
      receivedAt: days(5),
      extensionMonths: 2,
      closedAt: null,
      now: NOW,
    });
    expect(state.label).toBe("53 days left");
    expect(state.risk).toBe("Extended");
    expect(state.deadline).toBe("5 Dec 2026");
  });

  it("shows the closure date for Completed and Rejected cases", () => {
    const completed = sla({
      status: "Completed",
      receivedAt: RECEIVED,
      closedAt: new Date(Date.UTC(2026, 9, 2)),
      now: NOW,
    });
    expect(completed.label).toBe("Closed 2 Oct");
    expect(completed.risk).toBe("Closed");
    expect(completed.open).toBe(false);
    expect(completed.pct).toBe(100);
    expect(completed.daysLeft).toBe(999);
    expect(completed.deadline).toBe("—");
    expect(completed.icon).toBe("circle-check");

    const rejected = sla({
      status: "Rejected",
      receivedAt: RECEIVED,
      closedAt: new Date(Date.UTC(2026, 8, 4)),
      now: NOW,
    });
    expect(rejected.label).toBe("Closed 4 Sep");
    expect(rejected.open).toBe(false);
  });

  it("says Closed without a date when closedAt is missing", () => {
    expect(sla({ status: "Completed", receivedAt: RECEIVED, now: NOW }).label).toBe(
      "Closed",
    );
  });

  it("never reports less than 4% or more than 100%", () => {
    // Received today, so almost nothing has elapsed — the bar must stay visible.
    const fresh = at(NOW);
    expect(fresh.pct).toBe(4);
    expect(fresh.pct).toBeGreaterThanOrEqual(4);
    expect(at(days(1)).pct).toBeLessThanOrEqual(100);
  });

  it("builds the screen-reader label from label and risk", () => {
    expect(slaAriaLabel(at(RECEIVED))).toBe("SLA 11 days left, On track");
  });

  it("does not mutate the case's received date", () => {
    const received = new Date(RECEIVED.getTime());
    at(received, { extensionMonths: 2 });
    expect(received.toISOString()).toBe(RECEIVED.toISOString());
  });

  it("agrees with the seeded case's expected indicator", () => {
    const c = mkCase();
    const state = sla({
      status: c.status,
      receivedAt: c.receivedAt,
      extensionMonths: c.extensionMonths,
      closedAt: c.closedAt,
      now: NOW,
    });
    expect(state.label).toBe("11 days left");
  });
});
