/**
 * The rendering states, asserted as HTML rather than as intentions.
 *
 * The accessibility non-negotiable says status must never be conveyed by colour alone, so
 * these render the real components to static markup and assert the status is present as
 * TEXT. If someone later replaces the label with a coloured dot, this fails.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatePanel } from "@/app/app/_components/state-panel";
import { CaseList, type CaseRowView, type CaseListProps } from "@/app/app/_components/case-list";
import { ReasonDialog } from "@/app/app/_components/reason-dialog";
import { CaseHeader } from "@/app/app/_components/case-header";
import type { CaseSummary } from "@/server/cases/format";

const summary: CaseSummary = {
  caseNumber: "DSAR-2026-00418",
  requestType: "Access",
  status: "In progress",
  statusLabel: "In progress",
  priority: "High",
  received: "1 Oct 2026",
  due: "31 Oct 2026",
  deadline: { state: "due-soon", label: "Due in 5 day(s)" },
};

const row: CaseRowView = {
  caseNumber: "DSAR-2026-00418",
  requesterName: "Maya Lindqvist",
  requesterEmail: "maya.lindqvist@fjordmail.se",
  requestType: "Access",
  status: "In progress",
  statusLabel: "In progress",
  ownerName: "Priya Shah",
  received: "24 Sep 2026",
  sla: { label: "11 days left", risk: "On track", pct: 63 },
  checklist: "4 of 7",
  priority: "High",
};

const noopAssign = async () => ({ ok: true as const, data: { updated: 0, ownerName: "x" } });
const noopExport = async () => ({
  ok: true as const,
  data: { csv: "", filename: "cases.csv", count: 0 },
});

function list(over: Partial<CaseListProps> = {}) {
  return (
    <CaseList
      client="Lumen Analytics"
      rows={[row]}
      counts={{ all: 6, mine: 5, due: 3, approval: 1, overdue: 2, closed: 1 }}
      view="all"
      q=""
      type="All"
      status="All"
      owners={[{ id: "u-1", name: "Priya Shah" }]}
      intakeHref="/intake"
      assign={noopAssign}
      exportCsv={noopExport}
      filtersActive={false}
      {...over}
    />
  );
}

describe("T-07 rendering states", () => {
  it("renders all five states, each with its own text", () => {
    const states = [
      { tone: "empty", title: "No cases yet", body: "When a request arrives it will appear here." },
      { tone: "error", title: "Something went wrong", body: "This page could not be loaded." },
      { tone: "denied", title: "Permission denied", body: "Your role does not permit viewing this." },
      { tone: "missing", title: "Case not found", body: "No case with that reference exists." },
      { tone: "loading", title: "Loading", body: "Fetching cases for this workspace." },
    ] as const;
    for (const s of states) {
      const html = renderToStaticMarkup(<StatePanel tone={s.tone} title={s.title} body={s.body} />);
      expect(html).toContain(s.title);
      expect(html).toContain(s.body);
      expect(html).toContain(`data-state="${s.tone}"`);
      expect(html).toContain('role="status"');
    }
  });

  it("conveys status, SLA and priority as TEXT, so removing colour changes nothing", () => {
    const html = renderToStaticMarkup(list());
    expect(html).toContain("In progress");
    expect(html).toContain("DSAR-2026-00418");
    expect(html).toContain("Access");
    expect(html).toContain("11 days left"); // the SLA, as words
    expect(html).toContain("4 of 7"); // the checklist, as words
    expect(html).toContain("High"); // the priority pill, as a word
    expect(html).toContain("Maya Lindqvist");
    expect(html).toContain("Priya Shah");
    expect(html).toContain('scope="col"');
    expect(html).toContain("<caption");
  });

  it("renders the saved views with their counts, and marks the active one", () => {
    const html = renderToStaticMarkup(list({ view: "overdue" }));
    for (const label of ["All open", "My cases", "Due soon", "Awaiting approval", "Overdue", "Closed"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-current="page"');
    expect(html).toMatch(/Overdue <span class="count">2<\/span>/);
  });

  it("shows the header subtitle and the intake link", () => {
    const html = renderToStaticMarkup(list());
    expect(html).toContain("Cases");
    expect(html).toContain("Lumen Analytics · sorted by deadline, nearest first");
    expect(html).toContain("Open public intake form");
    expect(html).toContain('target="_blank"');
  });

  it("renders an unassigned case as the word Unassigned, not an empty cell", () => {
    const html = renderToStaticMarkup(list({ rows: [{ ...row, ownerName: null }] }));
    expect(html).toContain("Unassigned");
  });

  it("shows the empty state with the prototype's copy, and no table", () => {
    const html = renderToStaticMarkup(list({ rows: [] }));
    expect(html).toContain("No cases in this view");
    expect(html).toContain("New requests from the intake form appear in All open.");
    expect(html).not.toContain("<tbody>");
  });

  it("offers Clear filters only when a filter is active", () => {
    expect(renderToStaticMarkup(list({ rows: [], filtersActive: true }))).toContain("Clear filters");
    expect(renderToStaticMarkup(list({ rows: [], filtersActive: false }))).not.toContain("Clear filters");
  });

  it("does not render the bulk bar until something is selected", () => {
    expect(renderToStaticMarkup(list())).not.toContain("bulk-bar");
  });

  it("keeps the search and filter controls in the URL, with the view preserved", () => {
    const html = renderToStaticMarkup(list({ view: "due", q: "maya" }));
    expect(html).toContain('name="q"');
    expect(html).toContain('value="due"'); // hidden view input
    expect(html).toContain('method="get"');
    expect(html).toContain("Search case ID, name or email");
  });

  it("the cockpit header shows the deadline state as text too", () => {
    const html = renderToStaticMarkup(<CaseHeader summary={summary} />);
    expect(html).toContain("Statutory deadline");
    expect(html).toContain("31 Oct 2026");
    expect(html).toContain("Due in 5 day(s)");
    expect(html).toContain("In progress");
  });
});

describe("ReasonDialog", () => {
  const base = {
    open: true,
    title: "Assign owner to 2 cases",
    description: "Each case records the reassignment in its audit log.",
    confirmLabel: "Assign owner",
    reasonPlaceholder: "e.g. Rebalancing queue for annual leave",
    onCancel: () => {},
    onConfirm: () => {},
  };

  it("renders the reason field, the choice, and refuses to confirm without a reason", () => {
    const html = renderToStaticMarkup(
      <ReasonDialog
        {...base}
        option={{
          label: "New owner",
          name: "ownerId",
          initial: "u-1",
          values: [{ value: "u-1", label: "Priya Shah" }],
        }}
      />,
    );
    expect(html).toContain("Assign owner to 2 cases");
    expect(html).toContain("Each case records the reassignment in its audit log.");
    expect(html).toContain("New owner");
    expect(html).toContain("Priya Shah");
    expect(html).toContain("Reason");
    expect(html).toContain("Rebalancing queue for annual leave");
    // The confirm button starts disabled: a reason is mandatory, so it cannot be skipped.
    expect(html).toMatch(/<button type="submit" class="button" disabled/);
    expect(html).toContain("<dialog");
  });

  it("renders nothing when closed", () => {
    expect(renderToStaticMarkup(<ReasonDialog {...base} open={false} />)).toBe("");
  });
});
