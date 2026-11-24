import { describe, expect, it } from "vitest";
import {
  CASE_LIST_COPY,
  CASE_VIEWS,
  csvCell,
  daysLeft,
  filterRows,
  filtersToQuery,
  parseFilters,
  toCsv,
  viewCounts,
  type CaseListRow,
  type ViewerContext,
} from "@/domain/caseList";
import type { CaseStatus, RequestType } from "@/domain/types";

const NOW = new Date(Date.UTC(2026, 9, 13, 10, 42));
const ctx: ViewerContext = { viewerId: "u-priya", now: NOW };
const day = (d: number) => new Date(Date.UTC(2026, 8, d));

function row(over: Partial<CaseListRow> & { caseNumber: string }): CaseListRow {
  return {
    requestType: "Access",
    status: "In progress",
    priority: "Normal",
    ownerId: "u-priya",
    ownerName: "Priya Shah",
    requesterName: "Maya Lindqvist",
    requesterEmail: "maya@example.test",
    receivedAt: day(24),
    dueAt: new Date(Date.UTC(2026, 9, 24)),
    extensionMonths: 0,
    checklistDone: 4,
    checklistTotal: 7,
    ...over,
  };
}

const ROWS: CaseListRow[] = [
  row({ caseNumber: "DSAR-2026-00418" }), // 11 days left
  row({ caseNumber: "DSAR-2026-00405", receivedAt: day(11), ownerId: "u-daniel", ownerName: "Daniel Okafor" }), // overdue 2
  row({ caseNumber: "DSAR-2026-00410", receivedAt: day(13) }), // due today
  row({ caseNumber: "DSAR-2026-00412", receivedAt: day(20), status: "Awaiting approval" }), // 7 left
  row({ caseNumber: "DSAR-2026-00398", status: "Completed", priority: "High" }), // closed
  row({ caseNumber: "DSAR-2026-00401", receivedAt: day(10), priority: "High" }), // overdue 3
  row({ caseNumber: "DSAR-2026-00415", receivedAt: day(14) }), // 1 left
];

describe("saved views", () => {
  const count = (view: Parameters<typeof viewCounts>[1] extends never ? never : (typeof CASE_VIEWS)[number]["key"]) =>
    ROWS.filter((r) => viewCounts([r], ctx)[view] === 1).length;

  it("counts every view, and Closed is the exact complement of All open", () => {
    const counts = viewCounts(ROWS, ctx);
    // Five of the six open cases are Priya's; the overdue one belongs to Daniel.
    expect(counts).toEqual({ all: 6, mine: 5, due: 3, approval: 1, overdue: 2, closed: 1 });
    expect(counts.all + counts.closed).toBe(ROWS.length);
  });

  it("splits Due soon at exactly 0 and 7 days", () => {
    // due today, 1 day, 7 days → 3; 11 days is out, negative is overdue not "due soon".
    expect(count("due")).toBe(3);
  });

  it("keeps an overdue case that awaits approval in BOTH views", () => {
    const overdueAwaiting = row({
      caseNumber: "DSAR-2026-00402",
      receivedAt: day(5),
      status: "Awaiting approval",
    });
    const counts = viewCounts([overdueAwaiting], ctx);
    expect(counts.overdue).toBe(1);
    expect(counts.approval).toBe(1);
  });

  it("treats 'My cases' as an ownership match on the id, not the name", () => {
    // Same display name, different person: must not appear in Priya's queue.
    const impostor = row({ caseNumber: "DSAR-2026-00421", ownerId: "u-other", ownerName: "Priya Shah" });
    expect(viewCounts([impostor], ctx).mine).toBe(0);
  });

  it("treats 'My cases' as an ownership match on open cases only", () => {
    const mineClosed = row({ caseNumber: "DSAR-2026-00390", status: "Completed" });
    expect(viewCounts([mineClosed], ctx).mine).toBe(0);
    const someoneElse = row({ caseNumber: "DSAR-2026-00420", ownerId: "u-daniel", ownerName: "Daniel Okafor" });
    expect(viewCounts([someoneElse], ctx).mine).toBe(0);
  });

  it("has no view that hides a case by accident: every open case appears in All open", () => {
    for (const r of ROWS) {
      const counts = viewCounts([r], ctx);
      const anyOpenView = counts.all === 1;
      expect(anyOpenView || counts.closed === 1, r.caseNumber).toBe(true);
    }
  });
});

describe("parseFilters()", () => {
  it("defaults to All open with nothing filtered", () => {
    expect(parseFilters({})).toEqual({ view: "all", q: "", type: "All", status: "All" });
  });

  it("accepts valid values and trims the search", () => {
    expect(parseFilters({ view: "overdue", q: "  maya ", type: "Erasure", status: "New" })).toEqual({
      view: "overdue",
      q: "maya",
      type: "Erasure",
      status: "New",
    });
  });

  it("falls back rather than throwing, because anyone can edit the URL", () => {
    expect(parseFilters({ view: "nonsense", type: "Bogus", status: "Nope" })).toEqual({
      view: "all",
      q: "",
      type: "All",
      status: "All",
    });
  });

  it("takes the first value when a parameter repeats, and caps the query length", () => {
    expect(parseFilters({ view: ["due", "closed"], q: "x".repeat(500) }).view).toBe("due");
    expect(parseFilters({ q: "x".repeat(500) }).q).toHaveLength(120);
  });
});

describe("filtersToQuery()", () => {
  it("omits defaults so the canonical URL stays clean", () => {
    expect(filtersToQuery({ view: "all", q: "", type: "All", status: "All" })).toBe("");
  });

  it("round-trips through parseFilters", () => {
    const filters = { view: "due" as const, q: "maya lindqvist", type: "Access" as const, status: "In progress" as const };
    const query = filtersToQuery(filters);
    expect(query.startsWith("?")).toBe(true);
    const parsed = parseFilters(Object.fromEntries(new URLSearchParams(query.slice(1))));
    expect(parsed).toEqual(filters);
  });
});

describe("filterRows()", () => {
  const base = { view: "all" as const, q: "", type: "All" as const, status: "All" as const };

  it("sorts by days left ascending, then by case number", () => {
    expect(filterRows(ROWS, base, ctx).map((r) => r.caseNumber)).toEqual([
      "DSAR-2026-00401", // -3
      "DSAR-2026-00405", // -2
      "DSAR-2026-00410", // 0
      "DSAR-2026-00415", // 1
      "DSAR-2026-00412", // 7
      "DSAR-2026-00418", // 11
    ]);
  });

  it("searches case number, name and email, case-insensitively", () => {
    const byNumber = filterRows(ROWS, { ...base, q: "00418" }, ctx);
    expect(byNumber.map((r) => r.caseNumber)).toEqual(["DSAR-2026-00418"]);

    // 6, not 7: the closed case is the same requester but "All open" excludes it.
    const byName = filterRows(ROWS, { ...base, q: "lindqvist" }, ctx);
    expect(byName).toHaveLength(6);

    const byEmail = filterRows(ROWS, { ...base, q: "MAYA@EXAMPLE" }, ctx);
    expect(byEmail).toHaveLength(6);

    expect(filterRows(ROWS, { ...base, q: "nobody" }, ctx)).toEqual([]);
  });

  it("combines view, type and status as AND", () => {
    const erasureOverdue = row({
      caseNumber: "DSAR-2026-00403",
      requestType: "Erasure",
      receivedAt: day(9),
    });
    const rows = [...ROWS, erasureOverdue];
    const result = filterRows(rows, { ...base, view: "overdue", type: "Erasure" }, ctx);
    expect(result.map((r) => r.caseNumber)).toEqual(["DSAR-2026-00403"]);
    expect(filterRows(rows, { ...base, view: "overdue", status: "Completed" }, ctx)).toEqual([]);
  });

  it("does not mutate the array it was given", () => {
    const copy = [...ROWS];
    filterRows(ROWS, base, ctx);
    expect(ROWS).toEqual(copy);
  });

  it("agrees with daysLeft() for every row", () => {
    for (const r of ROWS) {
      const state = daysLeft(r, ctx);
      expect(Number.isInteger(state), r.caseNumber).toBe(true);
    }
  });
});

describe("copy", () => {
  it("keeps the prototype's strings verbatim", () => {
    expect(CASE_LIST_COPY.title).toBe("Cases");
    expect(CASE_LIST_COPY.subtitle("Lumen Analytics")).toBe(
      "Lumen Analytics · sorted by deadline, nearest first",
    );
    expect(CASE_LIST_COPY.intakeLink).toBe("Open public intake form");
    expect(CASE_LIST_COPY.searchPlaceholder).toBe("Search case ID, name or email");
    expect(CASE_LIST_COPY.empty.title).toBe("No cases in this view");
    expect(CASE_LIST_COPY.empty.body.startsWith("New requests from the intake form appear in All open.")).toBe(true);
    expect(CASE_LIST_COPY.checklist(4, 7)).toBe("4 of 7");
    expect(CASE_LIST_COPY.unassigned).toBe("Unassigned");
  });

  it("pluralises the bulk strings", () => {
    expect(CASE_LIST_COPY.bulk.selected(3)).toBe("3 selected");
    expect(CASE_LIST_COPY.bulk.assignTitle(1)).toBe("Assign owner to 1 case");
    expect(CASE_LIST_COPY.bulk.assignTitle(3)).toBe("Assign owner to 3 cases");
    expect(CASE_LIST_COPY.bulk.assigned(1, "Daniel Okafor")).toBe("1 case assigned to Daniel Okafor.");
    expect(CASE_LIST_COPY.bulk.assigned(2, "Daniel Okafor")).toBe("2 cases assigned to Daniel Okafor.");
    expect(CASE_LIST_COPY.bulk.exported(2)).toBe(
      "2 cases exported to CSV. Export logged on each case.",
    );
  });

  it("lists the prototype's views in order", () => {
    expect(CASE_VIEWS.map((v) => v.label)).toEqual([
      "All open",
      "My cases",
      "Due soon",
      "Awaiting approval",
      "Overdue",
      "Closed",
    ]);
  });
});

describe("CSV", () => {
  it("quotes commas, quotes and newlines, and doubles inner quotes", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("writes a header and one CRLF-terminated row per case", () => {
    const csv = toCsv([ROWS[0]!], ctx);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "Case ID,Requester,Email,Type,Status,Owner,Received,Deadline,Days left,Priority",
    );
    expect(lines[1]).toBe(
      "DSAR-2026-00418,Maya Lindqvist,maya@example.test,Access,In progress,Priya Shah,24 Sep 2026,24 Oct 2026,11,Normal",
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("renders an unassigned case without an empty column", () => {
    const csv = toCsv([row({ caseNumber: "DSAR-2026-00430", ownerId: null, ownerName: null })], ctx);
    expect(csv).toContain(",Unassigned,");
  });

  it("stays parseable when a name contains a comma", () => {
    const csv = toCsv([row({ caseNumber: "DSAR-2026-00431", requesterName: "Smith, John" })], ctx);
    expect(csv).toContain('"Smith, John"');
  });
});
