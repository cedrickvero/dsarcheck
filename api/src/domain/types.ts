/**
 * Shared domain types, ported from `design/docs/04-data-model.md`.
 *
 * Pure types only — no I/O, no framework imports, so both the API and the
 * client can depend on them. Names mirror the prototype so seed data ports
 * directly.
 */

// ── Enums (docs/04) ──────────────────────────────────────────────────────────

export type OrgKind = "Direct" | "Agency";
export type Plan = "Starter" | "Growth" | "Agency";
export type OrgStatus = "Active" | "Trial" | "Suspended";
export type WorkspaceRole = "Handler" | "SystemOwner" | "Approver" | "Admin";
export type StaffRole = "Platform admin" | "Support" | "Security" | "Billing";

export type RequestType =
  | "Access"
  | "Rectification"
  | "Erasure"
  | "Portability"
  | "Objection"
  | "Restriction";

export type CaseStatus =
  | "New"
  | "Verifying"
  | "In progress"
  | "Awaiting approval"
  | "Completed"
  | "Extended"
  | "Rejected";

export type Risk = "Low" | "Medium" | "High";
export type IdMatch = "Match" | "Partial" | "No match";
export type EmailVerification = "Pending" | "Confirmed";
export type Priority = "Normal" | "High";
export type IdentKind =
  | "Customer ID"
  | "Account email"
  | "Phone number"
  | "Other reference";

export type SystemStatus =
  | "Not started"
  | "In progress"
  | "Completed"
  | "Not found"
  | "Action required"
  | "Retained under exception";

export type ErasureOutcome =
  | "Deleted"
  | "Suppressed / anonymized"
  | "Retained under exception"
  | "Not found"
  | "Action required";

export type ExceptionCategory =
  | "Legal obligation — tax and accounting"
  | "Establishment or defence of legal claims"
  | "Fraud prevention"
  | "Other documented exception";

export type RedactionCategory =
  | "Name"
  | "Email"
  | "Phone number"
  | "ID number"
  | "Third-party personal data"
  | "Confidential free-text note";

export type RedactionReview = "none" | "requested" | "done";

export type AuditCategory =
  | "Intake"
  | "Identity"
  | "Checklist"
  | "Redaction"
  | "Erasure"
  | "Approval"
  | "Evidence"
  | "Communications"
  | "SLA"
  | "Case";

export type AdminAuditCategory =
  | "Organizations"
  | "Billing"
  | "Subdomains"
  | "Domains"
  | "Access"
  | "Staff"
  | "Policy";

export type ApprovalDecision = "Approved" | "Changes requested" | "Refused";
export type SubdomainStatus = "none" | "review" | "claimed";
export type DnsStatus = "none" | "pending" | "verified" | "failing";
export type GrantStatus = "pending" | "active" | "ended" | "declined";
export type GrantScope = "Settings and portal only" | "Read-only case view";

/** SLA risk label. These strings are user-facing copy (docs/02 SLA table). */
export type SlaRisk =
  | "Closed"
  | "Overdue"
  | "Strong warning"
  | "Due soon"
  | "On track"
  | "Extended";

/** Semantic pill tone — the `T` map in the seed. Hexes live in the design system. */
export type Tone = "gray" | "info" | "teal" | "warn" | "ok" | "bad";

// ── Entities (docs/04) ───────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  kind: OrgKind;
  plan: Plan;
  status: OrgStatus;
  trialEndsAt?: Date;
  suspendReason?: string;
  suspensionKind?: "non_payment" | "manual";
  suspendedAt?: Date;
  ownerUserId: string;
  seatLimit: number;
  mfaRequired: boolean;
  region: "eu-central-1";
  createdAt: Date;
}

export interface WorkspaceSettings {
  mfaEnforced: boolean;
  /** [1, 7, 14, 21, 28, 30] by default. */
  reminderDays: number[];
  escalationUserIds: string[];
  approverReviewsExtensions: boolean;
  /** Default false. Nothing is ever sent without an explicit human click. */
  autoSendFinalResponse: boolean;
}

export interface Workspace {
  id: string;
  orgId: string;
  name: string;
  initial: string;
  verifiedEmailDomain: string;
  privacyEmail: string;
  senderName: string;
  avgClosureDays?: number;
  retentionMonths: number;
  timezone: string;
  settings: WorkspaceSettings;
}

export interface User {
  id: string;
  name: string;
  email: string;
  mfaEnabled: boolean;
  lastActiveAt?: Date;
}

export interface Membership {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  /** Agency memberships: the client workspaces they may reach. */
  scope?: string[];
  active: boolean;
}

export interface Portal {
  workspaceId: string;
  subdomain?: string;
  subdomainStatus: SubdomainStatus;
  subdomainMatchesDomain: boolean;
  brandColor?: string;
  brandConfirmed: boolean;
  logoUrl?: string;
  requestTypes: RequestType[];
  jurisdictions: ("gdpr" | "uk" | "ccpa")[];
  idLevel: string;
  rulesSaved: boolean;
  live: boolean;
  linkPublished: boolean;
  poweredBy: boolean;
  customDomain?: string;
  customDomainStatus: DnsStatus;
  customDomainToken?: string;
  mailStatus: DnsStatus;
  history: { at: Date; actor: string; text: string }[];
}

/** A configured data source (the prototype's `SYS` entries). */
export interface DataSource {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  sub: string;
  defaultOwnerId?: string;
  method: string;
  evidenceRequired: string;
  defaultSlaDays: number;
  instructions: string;
  active: boolean;
}

export interface IdDecision {
  by: string;
  at: Date;
  reason: string;
  rejected?: boolean;
}

export interface Case {
  id: string;
  workspaceId: string;
  type: RequestType;
  status: CaseStatus;
  priority: Priority;
  requester: {
    name: string;
    email: string;
    identKind: IdentKind;
    ident: string;
  };
  details: string;
  receivedAt: Date;
  channel: "Hosted intake form";
  ownerId: string;
  approverId?: string;
  risk: Risk;
  emailVerification: EmailVerification;
  idMatch: IdMatch;
  idMatchNote?: string;
  idDocumentFileId?: string;
  /** Never rendered: viewing is per-viewer and audit-only. */
  idDocRevealed?: never;
  idVerified: boolean;
  idDecision?: IdDecision | null;
  infoRequested: boolean;
  extensionMonths: 0 | 1 | 2;
  template?: string | null;
  redactionReview: RedactionReview;
  finalExportFileId?: string;
  responseSentAt?: Date;
  closedAt?: Date;
}

export interface CaseSystem {
  caseId: string;
  sourceKey: string;
  ownerId: string;
  status: SystemStatus;
  dueAt: Date;
  outcome?: ErasureOutcome;
  reason: string;
  exceptionCategory?: ExceptionCategory;
  outcomeAt?: Date;
  evidence: string[];
}

export interface CaseFile {
  id: string;
  caseId: string;
  sourceKey?: string;
  name: string;
  type: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: Date;
  storageKey: string;
  sha256: string;
  version: number;
  needsRedaction?: boolean;
  isRedactedExport?: boolean;
  isEvidence: boolean;
  purgeAfter?: Date;
  purgedAt?: Date;
}

export interface Comment {
  id: string;
  caseId: string;
  sourceKey: string;
  by: string;
  at: Date;
  text: string;
}

export interface Note {
  id: string;
  caseId: string;
  by: string;
  at: Date;
  text: string;
}

export interface RedactionToken {
  id: string;
  fileId: string;
  text?: string;
  page?: number;
  rect?: { x: number; y: number; w: number; h: number };
  category: RedactionCategory;
  flagged: boolean;
  redacted: boolean;
}

export interface Redaction {
  id: string;
  caseId: string;
  fileId: string;
  tokenId: string;
  category: RedactionCategory;
  /** First 4 characters plus an ellipsis — never the full value. */
  snippet: string;
  reason: string;
  by: string;
  at: Date;
}

export interface Approval {
  id: string;
  caseId: string;
  by: string;
  at: Date;
  decision: ApprovalDecision;
  note: string;
}

export interface Communication {
  id: string;
  caseId: string;
  at: Date;
  direction: "Outbound" | "Inbound";
  subject: string;
  channel: "Email" | "Portal";
  bodyRef?: string;
}

export interface EvidencePack {
  id: string;
  caseId: string;
  version: number;
  at: Date;
  by: string;
  draft: boolean;
  pdfKey: string;
  zipKey: string;
  sha256: string;
}

export interface AuditEvent {
  id: string;
  workspaceId: string;
  caseId?: string;
  at: Date;
  actorType: "user" | "system" | "requester" | "staff";
  actorId?: string;
  actorLabel: string;
  action: string;
  category: AuditCategory;
  reason: string;
  objectRef: string;
  ip?: string;
  sessionId?: string;
  meta?: string;
}

export interface NotificationRead {
  userId: string;
  /** caseId + kind */
  key: string;
  readAt: Date;
}

// ── Domain inputs ────────────────────────────────────────────────────────────
//
// The derivation functions in this folder take narrow state, not the full row
// set: a case plus its systems is all `sla()`, `progress()`, `checks()`,
// `respText()` and `deriveNotifications()` need. Keeping the inputs narrow is
// what lets them stay pure and unit-testable without a database.

export interface CaseSystemState {
  key: string;
  status: SystemStatus;
  outcome?: ErasureOutcome | null;
  evidence: string[];
  reason?: string;
  exceptionCategory?: ExceptionCategory | null;
}

/** Everything the domain derivations read off a case. */
export interface CaseState {
  id: string;
  type: RequestType;
  status: CaseStatus;
  priority: Priority;
  risk: Risk;
  name: string;
  email: string;
  ident: string;
  receivedAt: Date;
  extensionMonths: 0 | 1 | 2;
  /** G15: pending extension months (1 or 2) awaiting Approver review; null when none. */
  extensionRequestedMonths?: number | null;
  ownerName: string;
  approverName?: string;
  emailVerification: EmailVerification;
  idMatch: IdMatch;
  idMatchNote?: string;
  idVerified: boolean;
  idDecision?: IdDecision | null;
  infoRequested: boolean;
  template?: string | null;
  redactionReview: RedactionReview;
  finalExportDone: boolean;
  closedAt?: Date | null;
  responseSentAt?: Date | null;
  packs: number;
  systems: CaseSystemState[];
  tokens: { flagged: boolean; redacted: boolean }[];
  /** Most recent audit action, for the "Changes requested" notification. */
  lastAuditAction?: string;
  lastAuditReason?: string;
}
