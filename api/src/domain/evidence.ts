/**
 * The evidence-pack document (docs/03 E6): nine numbered sections assembled from case
 * state, systems, redaction tokens and audit events. Pure and JSON-safe so the server can
 * snapshot the result into `evidence_packs.content` and the UI can render it without any
 * database or framework dependency.
 *
 * Sections: 1 Request details · 2 Identity verification · 3 SLA timeline · 4 Systems
 * searched · 5 Actions by owner · 6 Redaction log · 7 Approvals · 8 Communications ·
 * 9 Final status.
 */

export interface EvidencePackSystem {
  name: string;
  owner: string;
  status: string;
  evidence: string[];
  reason: string;
}

export interface EvidencePackAuditEvent {
  at: string;
  actor: string;
  action: string;
  category: string;
  reason: string;
}

export interface EvidencePackInput {
  caseNumber: string;
  requestType: string;
  requesterName: string;
  requesterEmail: string;
  identifier: string;
  details: string;
  receivedAt: string;
  statutoryDueAt: string;
  status: string;
  closedAt: string | null;
  extensionMonths: number;
  emailVerification: string;
  identifierMatch: string;
  identifierNote: string;
  idDocumentProvided: boolean;
  identityVerified: boolean;
  clientName: string;
  systems: EvidencePackSystem[];
  audit: EvidencePackAuditEvent[];
}

export interface EvidencePackSection {
  title: string;
  /** Key/value pairs rendered as a definition list. */
  pairs: { label: string; value: string }[];
  /** Optional table (the Systems searched section). */
  table?: { columns: string[]; rows: string[][] };
}

export interface EvidencePackData {
  caseNumber: string;
  clientName: string;
  draft: boolean;
  generatedAt: string;
  sections: EvidencePackSection[];
}

const byCategory = (audit: EvidencePackAuditEvent[], category: string) =>
  audit.filter((e) => e.category === category);

function eventPairs(events: EvidencePackAuditEvent[]): { label: string; value: string }[] {
  return events.map((e) => ({
    label: e.actor,
    value: `${e.action}${e.reason ? ` — ${e.reason}` : ""}`,
  }));
}

export function buildEvidencePack(input: EvidencePackInput, draft: boolean, generatedAt: string): EvidencePackData {
  const humanActions = input.audit.filter((e) => e.actor !== "System" && !/requester\)$/.test(e.actor));
  const redactionLog = byCategory(input.audit, "Redaction");
  const approvals = byCategory(input.audit, "Approval");
  const communications = byCategory(input.audit, "Communications");

  const sections: EvidencePackSection[] = [
    {
      title: "Request details",
      pairs: [
        { label: "Requester", value: `${input.requesterName} <${input.requesterEmail}>` },
        { label: "Identifier", value: input.identifier || "—" },
        { label: "Request type", value: input.requestType },
        { label: "Received", value: input.receivedAt },
        { label: "Request", value: input.details || "—" },
      ],
    },
    {
      title: "Identity verification",
      pairs: [
        { label: "Email", value: input.emailVerification },
        { label: "Identifier match", value: `${input.identifierMatch}${input.identifierNote ? ` — ${input.identifierNote}` : ""}` },
        { label: "ID document", value: input.idDocumentProvided ? "Provided" : "Not provided" },
        { label: "Verified", value: input.identityVerified ? "Yes" : "No" },
      ],
    },
    {
      title: "SLA timeline",
      pairs: [
        { label: "Received", value: input.receivedAt },
        { label: "Statutory deadline", value: input.statutoryDueAt },
        { label: "Extension", value: input.extensionMonths ? `${input.extensionMonths} month${input.extensionMonths > 1 ? "s" : ""}` : "None" },
        { label: "Status", value: input.status },
        { label: "Closed", value: input.closedAt || "Case still open" },
      ],
    },
    {
      title: "Systems searched",
      pairs: [],
      table: {
        columns: ["System", "Owner", "Result", "Evidence"],
        rows: input.systems.map((s) => [
          s.name,
          s.owner,
          s.status,
          s.evidence.length ? s.evidence.join(", ") : "—",
        ]),
      },
    },
    {
      title: "Actions by owner",
      pairs: eventPairs(humanActions),
    },
    {
      title: "Redaction log",
      pairs: eventPairs(redactionLog),
    },
    {
      title: "Approvals",
      pairs: eventPairs(approvals),
    },
    {
      title: "Communications",
      pairs: eventPairs(communications),
    },
    {
      title: "Final status",
      pairs: [
        { label: "Status", value: input.status },
        { label: "Closed", value: input.closedAt || "Case still open" },
      ],
    },
  ];

  return {
    caseNumber: input.caseNumber,
    clientName: input.clientName,
    draft,
    generatedAt,
    sections,
  };
}
