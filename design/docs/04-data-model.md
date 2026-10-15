# 04 · Data model

TypeScript domain types (put in `src/domain/types.ts`) then the Postgres schema. Names mirror the prototype so seed data ports directly.

## Enums
```ts
export type OrgKind = 'Direct' | 'Agency';
export type Plan = 'Starter' | 'Growth' | 'Agency';
export type OrgStatus = 'Active' | 'Trial' | 'Suspended';
export type WorkspaceRole = 'Handler' | 'SystemOwner' | 'Approver' | 'Admin';
export type StaffRole = 'Platform admin' | 'Support' | 'Security' | 'Billing';

export type RequestType = 'Access' | 'Rectification' | 'Erasure' | 'Portability' | 'Objection' | 'Restriction';
export type CaseStatus = 'New' | 'Verifying' | 'In progress' | 'Awaiting approval' | 'Completed' | 'Extended' | 'Rejected';
export type Risk = 'Low' | 'Medium' | 'High';
export type IdMatch = 'Match' | 'Partial' | 'No match';
export type EmailVerification = 'Pending' | 'Confirmed';
export type Priority = 'Normal' | 'High';
export type IdentKind = 'Customer ID' | 'Account email' | 'Phone number' | 'Other reference';

export type SystemStatus = 'Not started' | 'In progress' | 'Completed' | 'Not found' | 'Action required' | 'Retained under exception';
export type ErasureOutcome = 'Deleted' | 'Suppressed / anonymized' | 'Retained under exception' | 'Not found' | 'Action required';
export type ExceptionCategory = 'Legal obligation — tax and accounting' | 'Establishment or defence of legal claims' | 'Fraud prevention' | 'Other documented exception';
export type RedactionCategory = 'Name' | 'Email' | 'Phone number' | 'ID number' | 'Third-party personal data' | 'Confidential free-text note';
export type RedactionReview = 'none' | 'requested' | 'done';
export type AuditCategory = 'Intake' | 'Identity' | 'Checklist' | 'Redaction' | 'Erasure' | 'Approval' | 'Evidence' | 'Communications' | 'SLA' | 'Case';
export type AdminAuditCategory = 'Organizations' | 'Billing' | 'Subdomains' | 'Domains' | 'Access' | 'Staff' | 'Policy';
export type ApprovalDecision = 'Approved' | 'Changes requested' | 'Refused';
export type SubdomainStatus = 'none' | 'review' | 'claimed';
export type DnsStatus = 'none' | 'pending' | 'verified' | 'failing';
export type GrantStatus = 'pending' | 'active' | 'ended' | 'declined';
export type GrantScope = 'Settings and portal only' | 'Read-only case view';
```

## Entities
```ts
interface Organization { id; name; kind: OrgKind; plan: Plan; status: OrgStatus; trialEndsAt?; suspendReason?; suspensionKind?: 'non_payment'|'manual'; suspendedAt?; ownerUserId; seatLimit; mfaRequired: boolean; region: 'eu-central-1'; createdAt }
interface Workspace { id; orgId; name; initial; verifiedEmailDomain; privacyEmail; senderName; avgClosureDays?; retentionMonths; settings: WorkspaceSettings }
interface WorkspaceSettings { mfaEnforced; reminderDays: number[] /* [1,7,14,21,28,30] */; escalationUserIds: string[]; approverReviewsExtensions: boolean; autoSendFinalResponse: boolean /* default false */ }
interface User { id; name; email; mfaEnabled; lastActiveAt }
interface Membership { userId; workspaceId; role: WorkspaceRole; scope?: string /* agency: client list */ ; active }
interface Portal { workspaceId; subdomain?; subdomainStatus: SubdomainStatus; subdomainMatchesDomain; brandColor; brandConfirmed; logoUrl?; requestTypes: RequestType[]; jurisdictions: ('gdpr'|'uk'|'ccpa')[]; idLevel: string; rulesSaved; live; linkPublished; poweredBy; customDomain?; customDomainStatus: DnsStatus; customDomainToken; mailStatus: DnsStatus; history: {at; actor; text}[] }
interface DataSource { id; workspaceId; key; name; sub; defaultOwnerId; method; evidenceRequired; defaultSlaDays; instructions; active }

interface Case {
  id /* DSAR-2026-00418 */; workspaceId; type: RequestType; status: CaseStatus; priority: Priority;
  requester: { name; email; identKind: IdentKind; ident; }; details; receivedAt; channel: 'Hosted intake form';
  ownerId; approverId; risk: Risk; emailVerification: EmailVerification; idMatch: IdMatch; idMatchNote; idDocumentFileId?; idDocRevealed?: never /* per-viewer, audit only */;
  idVerified: boolean; idDecision?: { by; at; reason; rejected?: boolean }; infoRequested: boolean;
  extensionMonths: 0|1|2; template?: string; redactionReview: RedactionReview; finalExportFileId?;
  responseSentAt?; closedAt?; closedMonth?: never /* derive */;
}
interface CaseSystem { caseId; sourceKey; ownerId; status: SystemStatus; dueAt; outcome?: ErasureOutcome; reason; exceptionCategory?; outcomeAt? }
interface CaseFile { id; caseId; sourceKey?; name; type; sizeBytes; uploadedBy; uploadedAt; storageKey; sha256; version; needsRedaction?; isRedactedExport?; isEvidence: boolean; purgeAfter?; purgedAt? /* requester portal shows this date */ }
interface Comment { id; caseId; sourceKey; by; at; text }
interface Note { id; caseId; by; at; text }
interface RedactionToken { id; fileId; text?; page?; rect?; category: RedactionCategory; flagged: boolean; redacted: boolean }
interface Redaction { id; caseId; fileId; tokenId; category; snippet /* first 4 chars + … */; reason; by; at }
interface Approval { id; caseId; by; at; decision: ApprovalDecision; note }
interface Communication { id; caseId; at; direction: 'Outbound'|'Inbound'; subject; channel: 'Email'|'Portal'; bodyRef? }
interface EvidencePack { id; caseId; version; at; by /* user or 'System' */; draft: boolean; pdfKey; zipKey; sha256 }
interface SignedLink { id; packId; expiresAt; recipientPurpose; createdBy; revokedAt? }
interface AuditEvent { id; workspaceId; caseId?; at; actorType: 'user'|'system'|'requester'|'staff'; actorId?; actorLabel; action; category: AuditCategory; reason; objectRef; ip?; sessionId?; meta? }
interface NotificationRead { userId; key /* caseId+kind */; readAt }

// Admin
interface StaffMember { id; name; email; role: StaffRole; securityKeyRegistered; lastActiveAt }
interface SubdomainReview { id; workspaceId; orgId; subdomain; verifiedDomain; requestedBy; requestedAt; note; flag?; status: 'pending'|'approved'|'rejected'; decision? }
interface ReservedName { name; addedBy; addedAt }
interface DomainCheck { id; workspaceId; domain; kind: 'Custom portal domain'|'Sending domain'; status: DnsStatus; issue?; lastCheckedAt }
interface SupportGrant { id; orgId; workspaceId; staffId; scope: GrantScope; reason; status: GrantStatus; approvedBy?; approvedAt?; expiresAt?; endedAt? }
interface PlatformPolicy { mfa: 'new'|'all'|'paid'; retentionMonths: 12|24|36; maxSupportHours: 4|24|72; fallbackSender: boolean; nonPaymentSuspendDays: 3|7|14 /* default 3 */ }
interface StaffAuditEvent { id; at; actorLabel; staffId?; action; category: AdminAuditCategory; reason }

// Billing (mirror of the payment provider; provider is source of truth)
type SubStatus = 'trial' | 'active' | 'past_due' | 'canceling' | 'canceled';
interface PlanPrice { plan: Plan; monthlyEur: 79|199|499; annualEur: 790|1990|4990; includedDsars: 5|25|100; workspaces: 1|3|15; overageEur: 15|10|8 }
interface Subscription { id; orgId; providerId; plan: Plan; cycle: 'Monthly'|'Annual'; priceEur; status: SubStatus; startedAt; currentPeriodStart; currentPeriodEnd; trialEndsAt?; cancelAtPeriodEnd: boolean; creditBalanceEur; paymentMethodLabel /* "Visa •••• 4417" */; failedAttempts }
interface UsagePeriod { subscriptionId; periodStart; periodEnd; dsarsReceived; included; overageCount; overageEur }
interface Invoice { id; number /* INV-2026-0141 */; orgId; period; issuedAt; dueAt; amountEur; status: 'upcoming'|'open'|'overdue'|'paid'|'void'; paidAt?; note?; pdfUrl? ; lines: {label; qty; unitEur; amountEur}[] }
interface Payment { id; orgId; invoiceId; at; methodLabel; amountEur /* negative for refunds */; status: 'succeeded'|'failed'|'refund'; failureReason?; refundOf?; note }
interface Credit { id; orgId; amountEur; reason; by; at; appliedToInvoiceId? }
interface BillingProfile { orgId; billingEmail; address; vatId; country }

// Requester portal
interface RequesterLogin { id; workspaceId; emailHash; codeHash; linkTokenHash; expiresAt; usedAt? }
interface RequesterSession { id; workspaceId; email; createdAt; lastSeenAt /* 30 min idle */ }
interface RequesterMessage { id; caseId; at; direction: 'Outbound'|'Inbound'; subject; body; attachments?: string[] }
interface RequesterUpload { id; caseId; fileId; requestedItem /* from Request more information option */; note?; at }
```

## Postgres notes
- Every customer table has `org_id` and `workspace_id` NOT NULL; RLS policy `workspace_id = ANY(current_setting('app.workspace_ids')::uuid[])`. Staff access to customer tables only via a `SECURITY DEFINER` function that checks an active `support_grant` and scope.
- `audit_event` and `staff_audit_event`: INSERT-only. Revoke UPDATE/DELETE from the app role; add a trigger that raises on UPDATE/DELETE. Optional hash chain (`prev_hash`, `hash`) for tamper evidence.
- Case IDs: `DSAR-{YYYY}-{5-digit sequence}` per workspace (prototype IDs are global; per-workspace is fine). Use a sequence table with row lock.
- Store files encrypted in object storage; DB holds key, hash, size. `purge_after = closed_at + 30 days` for raw exports (policy doc). Evidence pack + audit metadata kept for `retention_months`.
- Indices: `case(workspace_id, status)`, `case(workspace_id, received_at)`, `audit_event(case_id, at)`, `case_system(case_id)`.
- Requester status token: random 32-byte token, hashed in DB, linked to case; emailed only.
- Times stored UTC (`timestamptz`); workspace has `timezone` (add; default Europe/Berlin).

## Seed
Port `reference/seed/workspace-seed.js` `seed()` and `seedPortal()` and `reference/seed/admin-seed.js` (incl. `SUBS`, `PAYMENTS`, `INVOICES`, `CASH`, `PLANS`) into `db/seed.ts`. Requester portal seed (Maya Lindqvist: DSAR-2026-00418 and a completed DSAR-2026-00287 Rectification) is in `reference/logic/requester-portal-logic.js`. Keep the same names, IDs and dates so the app matches the prototypes screen for screen. In dev, set a fixed clock to `2026-10-13T10:42` (prototype "now") behind `DEV_FIXED_NOW`.
