import { describe, expect, it } from "vitest";
import {
  addDaysUtc,
  addMonthsUtc,
  dayWord,
  diffInDays,
  formatDate,
  formatDateShort,
  formatDateTime,
  parseIsoDate,
  startOfUtcDay,
} from "@/domain/dates";

describe("parseIsoDate()", () => {
  it("parses a calendar date as UTC midnight", () => {
    const date = parseIsoDate("2026-10-13");
    expect(date.toISOString()).toBe("2026-10-13T00:00:00.000Z");
  });

  it("refuses anything that is not YYYY-MM-DD", () => {
    for (const bad of ["13 Oct 2026", "2026-10-13T10:42", "2026-1-3", ""]) {
      expect(() => parseIsoDate(bad)).toThrow(/expected YYYY-MM-DD/);
    }
  });
});

describe("UTC arithmetic", () => {
  it("drops the time component", () => {
    expect(startOfUtcDay(new Date("2026-10-13T10:42:00Z")).toISOString()).toBe(
      "2026-10-13T00:00:00.000Z",
    );
  });

  it("adds months without touching the input", () => {
    const input = new Date("2026-09-24T00:00:00Z");
    expect(addMonthsUtc(input, 1).toISOString()).toBe("2026-10-24T00:00:00.000Z");
    expect(addMonthsUtc(input, 3).toISOString()).toBe("2026-12-24T00:00:00.000Z");
    expect(input.toISOString()).toBe("2026-09-24T00:00:00.000Z");
  });

  it("rolls month-end over exactly as the prototype's setMonth did", () => {
    // 31 Jan + 1 month is 3 Mar in JS; the prototype behaved the same way, and a
    // statutory deadline derived from it must not silently change.
    expect(addMonthsUtc(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe(
      "2026-03-03T00:00:00.000Z",
    );
  });

  it("adds days across a month boundary", () => {
    expect(addDaysUtc(new Date("2026-10-28T00:00:00Z"), 5).toISOString()).toBe(
      "2026-11-02T00:00:00.000Z",
    );
  });

  it("counts whole days, rounding partial days the way the prototype did", () => {
    const from = new Date("2026-10-13T10:42:00Z");
    // 10 days 13h18m away → 11, matching the prototype's midnight-anchored count.
    expect(diffInDays(from, new Date("2026-10-24T00:00:00Z"))).toBe(11);
    expect(diffInDays(from, from)).toBe(0);
    // 2 days 10h in the past → -2.
    expect(diffInDays(from, new Date("2026-10-11T00:00:00Z"))).toBe(-2);
  });
});

describe("formatting", () => {
  const date = new Date("2026-10-13T10:42:00Z");

  it("formats the three instance formats", () => {
    expect(formatDate(date)).toBe("13 Oct 2026");
    expect(formatDateShort(date)).toBe("13 Oct");
    expect(formatDateTime(date)).toBe("13 Oct 2026, 10:42");
  });

  it("pads the 24-hour clock", () => {
    expect(formatDateTime(new Date("2026-10-03T09:05:00Z"))).toBe("3 Oct 2026, 09:05");
    expect(formatDateTime(new Date("2026-12-31T23:59:00Z"))).toBe("31 Dec 2026, 23:59");
  });

  it("produces the same string whatever the host timezone", () => {
    // The suite runs with TZ unset; UTC arithmetic is what makes these stable.
    expect(formatDate(new Date("2026-01-01T00:00:00Z"))).toBe("1 Jan 2026");
    expect(formatDate(new Date("2026-12-31T23:30:00Z"))).toBe("31 Dec 2026");
  });

  it("pluralises day counts", () => {
    expect(dayWord(1)).toBe("day");
    expect(dayWord(0)).toBe("days");
    expect(dayWord(2)).toBe("days");
  });
});
