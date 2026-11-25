/**
 * The identity tab components, rendered to markup: the verification facts are text, the
 * recorded decision is shown or the empty state, and the decision form offers the three
 * decisions with a reason field (the "what is needed" input only for request-info).
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IdentityTab } from "@/app/app/_components/identity-tab";
import { IdentityDecisionForm } from "@/app/app/_components/identity-decision-form";
import type { IdentityRecord } from "@/server/cases/identity";

const noop = async () => ({ ok: true });

const identity = (over: Partial<IdentityRecord> = {}): IdentityRecord => ({
  emailConfirmedAt: new Date("2026-09-24T09:31:00Z"),
  identifierMatch: "Match",
  identifierNote: "customer ID matches the account email",
  idDocumentProvided: true,
  identityVerified: false,
  infoRequested: false,
  risk: "High",
  decision: null,
  ...over,
});

describe("IdentityTab", () => {
  it("shows the verification facts and the empty decision state", () => {
    const html = renderToStaticMarkup(
      <IdentityTab caseId="c1" caseNumber="DSAR-2026-00418" identity={identity()} canDecide action={noop} />,
    );
    expect(html).toContain("Confirmed 24 Sep 2026");
    expect(html).toContain("Match");
    expect(html).toContain("High");
    expect(html).toContain("Provided");
    expect(html).toContain("Not verified");
    expect(html).toContain("No decision recorded yet.");
  });

  it("shows the recorded decision with who, when and why", () => {
    const html = renderToStaticMarkup(
      <IdentityTab
        caseId="c1"
        caseNumber="DSAR-2026-00418"
        identity={identity({
          decision: { decision: "approve", infoOption: null, by: "Priya Shah", at: new Date("2026-09-24T11:05:00Z"), reason: "email and ID match" },
        })}
        canDecide
        action={noop}
      />,
    );
    expect(html).toContain("Approved");
    expect(html).toContain("Priya Shah");
    expect(html).toContain("email and ID match");
  });

  it("withholds the form from a role that cannot decide", () => {
    const html = renderToStaticMarkup(
      <IdentityTab caseId="c1" caseNumber="X" identity={identity()} canDecide={false} action={noop} />,
    );
    expect(html).toContain("Your role does not permit identity decisions.");
    expect(html).not.toContain("Approve identity");
  });
});

describe("IdentityDecisionForm", () => {
  it("offers the three decisions and a reason, hiding the info input for approve", () => {
    const html = renderToStaticMarkup(<IdentityDecisionForm caseId="c1" caseNumber="X" action={noop} />);
    expect(html).toContain("Approve identity");
    expect(html).toContain("Request more information");
    expect(html).toContain("Reject");
    expect(html).toContain("Reason (required)");
    expect(html).toContain(">Record decision<");
    expect(html).not.toContain("What is needed");
  });
});
