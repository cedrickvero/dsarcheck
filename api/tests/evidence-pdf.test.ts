import { describe, expect, it } from "vitest";
import { renderEvidencePackPdf } from "@/server/cases/evidence-pdf";
import { buildEvidencePack } from "@/domain/evidence";

const pack = buildEvidencePack(
  {
    caseNumber: "DSAR-2026-00117",
    requestType: "Access",
    requesterName: "Jane Doe",
    requesterEmail: "jane@example.com",
    identifier: "jane.doe",
    details: "All my data",
    receivedAt: "13 Oct 2026, 10:42",
    statutoryDueAt: "13 Nov 2026, 10:42",
    status: "In progress",
    closedAt: null,
    extensionMonths: 0,
    emailVerification: "Confirmed",
    identifierMatch: "Match",
    identifierNote: "",
    idDocumentProvided: true,
    identityVerified: true,
    clientName: "Fernwood & Co",
    systems: [{ name: "Mixpanel", owner: "Sara", status: "Action required", evidence: ["events.csv"], reason: "" }],
    audit: [
      { at: "13 Oct 2026, 10:42", actor: "Sara", action: "Redaction recorded", category: "Redaction", reason: "PII removed" },
      { at: "14 Oct 2026, 10:42", actor: "Daniel", action: "Approval decided", category: "Approval", reason: "Approved" },
    ],
  },
  false,
  "13 Oct 2026, 12:00",
);

describe("evidence pack PDF renderer", () => {
  it("emits a valid PDF with all nine section titles, deterministically", () => {
    const a = Buffer.from(renderEvidencePackPdf(pack));
    const b = Buffer.from(renderEvidencePackPdf(pack));
    expect(a.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(a.toString("ascii").endsWith("%%EOF\n")).toBe(true);
    // Deterministic: same input -> identical bytes (the signed-link content hash depends on it).
    expect(Buffer.compare(a, b)).toBe(0);
    const text = a.toString("ascii");
    for (const title of [
      "Request details",
      "Identity verification",
      "SLA timeline",
      "Systems searched",
      "Actions by owner",
      "Redaction log",
      "Approvals",
      "Communications",
      "Final status",
    ]) {
      expect(text).toContain(title);
    }
  });

  it("sanitises non-WinAnsi punctuation so the built-in Helvetica renders it", () => {
    const withDash = buildEvidencePack(
      { ...packInput(), details: "—" },
      false,
      "13 Oct 2026, 12:00",
    );
    const bytes = renderEvidencePackPdf(withDash);
    expect(Buffer.from(bytes).toString("ascii")).not.toContain("\u2014");
    expect(Buffer.from(bytes).toString("ascii")).toContain("-");
  });
});

function packInput() {
  return {
    caseNumber: "DSAR-2026-00117",
    requestType: "Access",
    requesterName: "Jane Doe",
    requesterEmail: "jane@example.com",
    identifier: "jane.doe",
    details: "All my data",
    receivedAt: "13 Oct 2026, 10:42",
    statutoryDueAt: "13 Nov 2026, 10:42",
    status: "In progress",
    closedAt: null,
    extensionMonths: 0,
    emailVerification: "Confirmed",
    identifierMatch: "Match",
    identifierNote: "",
    idDocumentProvided: true,
    identityVerified: true,
    clientName: "Fernwood & Co",
    systems: [{ name: "Mixpanel", owner: "Sara", status: "Action required", evidence: ["events.csv"], reason: "" }],
    audit: [{ at: "13 Oct 2026, 10:42", actor: "Sara", action: "Redaction recorded", category: "Redaction", reason: "PII removed" }],
  };
}
