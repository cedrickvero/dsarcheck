/**
 * The rendering states, asserted as HTML rather than as intentions.
 *
 * The accessibility non-negotiables say status must never be conveyed by colour alone, so
 * these render the real components to static markup and assert the status is present as
 * TEXT. If someone later replaces the label with a coloured dot, this fails.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatePanel } from "@/app/app/_components/state-panel";
import { CaseTable } from "@/app/app/_components/case-table";
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

  it("conveys status as TEXT, so removing colour changes nothing", () => {
    const html = renderToStaticMarkup(<CaseTable rows={[summary]} />);
    expect(html).toContain("In progress"); // the status, as words
    expect(html).toContain("DSAR-2026-00418");
    expect(html).toContain("Access");
    expect(html).toContain("Due in 5 day(s)"); // the deadline, also as words
    expect(html).toContain('scope="col"');
    expect(html).toContain("<caption");
  });

  it("the cockpit header shows the deadline state as text too", () => {
    const html = renderToStaticMarkup(<CaseHeader summary={summary} />);
    expect(html).toContain("Statutory deadline");
    expect(html).toContain("31 Oct 2026");
    expect(html).toContain("Due in 5 day(s)");
    expect(html).toContain("In progress");
  });

  it("an empty list renders an empty table body, not a crash", () => {
    const html = renderToStaticMarkup(<CaseTable rows={[]} />);
    expect(html).toContain("<tbody></tbody>");
  });
});
