/**
 * The evidence-pack document builder (pure): nine sections in order, Actions-by-owner
 * excludes System and requester actors, and the type sections filter by audit category.
 */
import { describe, expect, it } from "vitest";
import { buildEvidencePack, type EvidencePackInput } from "@/domain/evidence";

const input = (): EvidencePackInput => ({
  caseNumber: "DSAR-2026-00418",
  requestType: "Access",
  requesterName: "Maya Lindqvist",
  requesterEmail: "maya@x.se",
  identifier: "Customer ID C-20931",
  details: "copy of data",
  receivedAt: "24 Sep 2026, 09:12",
  statutoryDueAt: "24 Oct 2026",
  status: "In progress",
  closedAt: null,
  extensionMonths: 0,
  emailVerification: "Confirmed",
  identifierMatch: "Match",
  identifierNote: "",
  idDocumentProvided: false,
  identityVerified: true,
  clientName: "Lumen Analytics",
  systems: [{ name: "Production database", owner: "Priya Shah", status: "Completed", evidence: ["users_export.json"], reason: "" }],
  audit: [
    { at: "24 Sep", actor: "System", action: "Request received", category: "Intake", reason: "" },
    { at: "24 Sep", actor: "Priya Shah", action: "Identity approved", category: "Identity", reason: "matches" },
    { at: "6 Oct", actor: "Priya Shah", action: "redaction.recorded", category: "Redaction", reason: "third-party email" },
    { at: "6 Oct", actor: "Daniel Okafor", action: "Approved and closed", category: "Approval", reason: "looks good" },
    { at: "6 Oct", actor: "System", action: "Confirmation email sent", category: "Communications", reason: "" },
  ],
});

describe("buildEvidencePack", () => {
  it("builds the nine sections in order", () => {
    const data = buildEvidencePack(input(), true, "6 Oct 2026, 15:00");
    expect(data.sections.map((s) => s.title)).toEqual([
      "Request details",
      "Identity verification",
      "SLA timeline",
      "Systems searched",
      "Actions by owner",
      "Redaction log",
      "Approvals",
      "Communications",
      "Final status",
    ]);
  });

  it("excludes System and requester actors from Actions by owner", () => {
    const data = buildEvidencePack(input(), true, "x");
    const actions = data.sections[4]!;
    expect(actions.pairs.map((p) => p.label)).toEqual(["Priya Shah", "Priya Shah", "Daniel Okafor"]);
  });

  it("filters the type sections by audit category", () => {
    const data = buildEvidencePack(input(), true, "x");
    expect(data.sections[5]!.pairs).toHaveLength(1); // Redaction log
    expect(data.sections[6]!.pairs).toHaveLength(1); // Approvals
    expect(data.sections[7]!.pairs).toHaveLength(1); // Communications
  });

  it("renders the systems table", () => {
    const data = buildEvidencePack(input(), true, "x");
    const systems = data.sections[3]!;
    expect(systems.table!.columns).toEqual(["System", "Owner", "Result", "Evidence"]);
    expect(systems.table!.rows[0]![0]).toBe("Production database");
  });
});
