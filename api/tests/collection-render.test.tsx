/**
 * The collection & redaction components, rendered to markup: the files list, the flagged
 * items warning and table, the redact form, and the review/export buttons by state.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionTab } from "@/app/app/_components/collection-tab";
import { TokenRedactForm } from "@/app/app/_components/token-redact-form";
import { RedactionActions } from "@/app/app/_components/redaction-actions";
import type { CollectionView } from "@/server/cases/collection";

const noop = async () => ({ ok: true });

const view = (): CollectionView => ({
  caseId: "c1",
  requestType: "Access",
  redactionReview: "none",
  finalExportDone: false,
  files: [
    { id: "f1", sourceKey: "Zendesk", name: "support-ticket.pdf", type: "application/pdf", sizeBytes: 1200, version: 1, needsRedaction: true, isRedactedExport: false },
  ],
  tokens: [
    { id: "t1", fileId: "f1", page: 1, category: "Email", snippet: "maya…", flagged: true, redacted: false },
  ],
  flaggedCount: 1,
  unredactedCount: 1,
});

describe("CollectionTab", () => {
  it("renders the files list, warning, and flagged item", () => {
    const html = renderToStaticMarkup(
      <CollectionTab
        caseId="c1"
        caseNumber="DSAR-2026-00418"
        view={view()}
        canCompleteReview={false}
        actions={{ recordRedaction: noop, requestReview: noop, completeReview: noop, issueUpload: noop, recordExport: noop }}
      />,
    );
    expect(html).toContain("support-ticket.pdf");
    expect(html).toContain("Needs redaction");
    expect(html).toContain("1 flagged item");
    expect(html).toContain("may contain third-party or confidential data");
    expect(html).toContain("Email");
    expect(html).toContain("Not redacted");
  });
});

describe("TokenRedactForm", () => {
  it("offers a reason and a Redact action", () => {
    const html = renderToStaticMarkup(
      <TokenRedactForm caseId="c1" caseNumber="X" tokenId="t1" redacted={false} action={noop} />,
    );
    expect(html).toContain("Reason (required)");
    expect(html).toContain(">Redact<");
  });

  it("offers Unredact when already redacted", () => {
    const html = renderToStaticMarkup(
      <TokenRedactForm caseId="c1" caseNumber="X" tokenId="t1" redacted={true} action={noop} />,
    );
    expect(html).toContain(">Unredact<");
  });
});

describe("RedactionActions", () => {
  const base = { caseId: "c1", caseNumber: "X", requestReview: noop, completeReview: noop, issueUpload: noop, recordExport: noop };

  it("offers Request review when review is none", () => {
    const html = renderToStaticMarkup(<RedactionActions {...base} review="none" finalExportDone={false} canCompleteReview={true} />);
    expect(html).toContain("Request review");
  });

  it("offers Complete review when requested and approver", () => {
    const html = renderToStaticMarkup(<RedactionActions {...base} review="requested" finalExportDone={false} canCompleteReview={true} />);
    expect(html).toContain("Complete review");
  });

  it("offers the export only when review is done", () => {
    const html = renderToStaticMarkup(<RedactionActions {...base} review="done" finalExportDone={false} canCompleteReview={true} />);
    expect(html).toContain("Generate final redacted export");
  });
});
