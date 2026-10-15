# 07 · Build plan and paste-ready prompts

Paste one phase at a time into your coding agent. Each prompt assumes `/design` is in the repo and `AGENTS.md` is installed as the agent rules file. Don't move on until the phase's QA checks (docs/09) pass.

---

### Phase 0 — Scaffold and tokens
```
Read /design/README.md, /design/AGENTS.md and /design/docs/02-design-system.md.
Scaffold a Next.js 15 App Router + TypeScript (strict) + Tailwind v4 app.
1. Add IBM Plex Sans (400,500,600,700) and IBM Plex Mono (400,500,600) via next/font.
2. Define every color, radius, shadow and z-index from docs/02 as Tailwind theme tokens with the same names (navy-900, teal-600, tone-warn-bg, ...). Remove the default palette.
3. Add the global CSS from docs/02 § Global CSS.
4. Build these primitives in src/components/ui with Radix where relevant, matching docs/02 exactly: Button (primary, outline, danger, ghost, compact, disabled-with-note), Pill (takes tone+icon+label), Chip/FilterChip (aria-pressed, optional count), Tabs (with badge), Input, Textarea, Select, Switch, RadioCard, DataTable (header/row styles, selectable rows, keyboard Enter), Card, EmptyState, SlaIndicator (label+risk pill + 4px bar), Stepper, ReasonDialog (options, category, reason, audit preview, validation min length prop, Escape, focus trap, motion), Toast, StatusLine.
5. Create /dev/ui page showing every primitive in every state.
Use lucide-react icons with the names in docs/02.
```

### Phase 1 — Domain logic + seed (no UI)
```
Read /design/docs/04-data-model.md, /design/docs/05-workflows-and-rules.md and /design/reference/seed/workspace-seed.js, /design/reference/seed/admin-seed.js.
1. Create src/domain/types.ts from docs/04.
2. Port these pure functions to TypeScript in src/domain with identical behaviour and strings: sla(), progress(), checks(), respText(), deriveNotifications() (from renderVals notifications block in /design/reference/logic/workspace-logic.js), primaryCta(), steps(), attentionRanking() (from DSAR Workspace Single Company logic), subdomain validation (checkSub).
3. Add a clock abstraction: now() returns DEV_FIXED_NOW (2026-10-13T10:42) when set.
4. Unit tests (vitest) covering every branch: SLA labels (overdue 1 day vs N days, due today, 1 day left, >7), checks for erasure vs access, CTA disabled states per role, notification derivation per role, subdomain messages.
```

### Phase 2 — Database, auth, tenancy
```
Read /design/docs/04-data-model.md, /design/docs/06-backend-security.md, /design/docs/01-product-and-roles.md.
1. Postgres + Drizzle schema for all entities. org_id/workspace_id on every customer table. RLS policies. audit_event and staff_audit_event are insert-only (trigger rejects UPDATE/DELETE).
2. db/seed.ts ports seed(), seedPortal(), ORGS, REVIEWS, DOMAINS, GRANTS, STAFF, AUDIT with the same IDs, names and dates. Create users for every persona; Lumen = Direct org (Sara Lind admin), Northlight = Agency org (Mara Voss) owning Lumen, Fernwood, Kesto, Ardent client workspaces for the agency demo. Apply the consistency fixes in docs/08 §6.
3. Auth with TOTP MFA for workspace users and WebAuthn for staff. Sign-in, MFA setup/challenge, invite-accept screens per docs/08 G4.
4. src/server/authz.ts: can(user, action, resource) implementing the permission matrix and gates. Every mutation helper: authz → zod validate → transaction(change + audit event) → enqueue side effects.
5. Dev-only role switcher (env DEV_ROLE_SWITCH=1) reproducing the "View as (prototype)" control.
```

### Phase 3 — Workspace shell, case list, dashboard
```
Open /design/reference/prototypes/DSAR Workspace Single Company.dc.html and DSAR Workspace.dc.html in a browser and keep them open for comparison.
Build per /design/docs/03-screens.md sections A, B, C:
- App shell with sidebar (direct and agency variants by org.kind), notification bell + popover (derived notifications, unread per user, Mark all as read, Escape, focus return), user block, disclaimer.
- Dashboard (direct: KPIs + Needs attention; agency: KPIs across clients + Client workspaces table).
- Case list with saved views, search, type/status filters, bulk select (Assign owner with ReasonDialog, Export CSV logged), sorted by days left, empty state. URL holds view/filters.
Match spacing, sizes, colors and copy exactly. Add skeleton rows while loading.
```

### Phase 4 — Identity verification
```
Build docs/03 section D and cockpit tab E2 with the rules in docs/05 § Identity.
Queue table + detail panel, masked ID document with logged reveal, reviewer notes, Approve identity / Request more information / Reject via ReasonDialog with exact copy from /design/reference/logic/workspace-logic.js (idApprove, idInfo, idReject). High-risk gate enforced in UI and server. Approving generates the checklist from active data sources and logs the System event.
```

### Phase 5 — Case cockpit core
```
Build docs/03 section E header, stepper, rail, and tabs E1 Overview, E3 Data-source checklist, E7 Audit log.
Primary CTA per docs/05 table. Rail collapsible (340px ↔ 56px). Checklist row expansion with instructions, owner select, status buttons (evidence gate), evidence upload (pre-signed upload), comments, last change. Bulk actions. Audit log with category filters and CSV export (logged). Internal notes. Extend deadline dialog.
Also add a "My tasks" view for System owners (docs/08 G8): their assigned systems across open cases, with status, due date and a link into the case checklist row.
```

### Phase 6 — Collection & redaction, Erasure outcomes
```
Build tabs E4a and E4b per docs/03 and docs/05.
Redaction: file list, logged "Open original", PDF.js viewer with text-selection redaction (and box redaction for scans), category + reason, redaction log, review request → approver completes → generate final redacted export (server burns redactions into a new PDF; original kept as v1). Third-party warning count.
Erasure: five-column board, outcome dialog with category when retained, blocker banner, auto outcome record.
```

### Phase 7 — Approval, response, evidence pack
```
Build tabs E5 and E6 per docs/03 and docs/05.
Pre-closure checklist, template select, response preview from respText(), Send for approval / Approve and close / Request changes / Reject with documented reason (Approver-gated), Send response / Copy for manual send. Evidence pack preview (9 sections), generate/regenerate versions, Playwright PDF + ZIP with manifest and audit.csv, signed links with expiry and access logging. Replace toasts with StatusLine for these outcomes (docs/08 §2.4).
```

### Phase 8 — Public intake, requester portal, emails
```
Build docs/03 section H exactly like /design/reference/prototypes/Intake Form.dc.html, tenant-resolved by Host header, branded from Portal settings. Add Turnstile, attachments, duplicate warning (docs/08 G14), rate limiting. Submission creates a New case, sends "We received your data request", logs System events. Success screen links to the requester portal.
Build the requester portal (docs/03 section H2, rules in docs/05 § Requester portal rules) exactly like /design/reference/prototypes/Requester Portal.dc.html: magic link + 6-digit code sign-in without enumeration, your requests, request detail with status mapping, progress timeline, info-needed upload, extension notice, documents with signed expiring links, messages. Wire uploads and messages back into the workspace (docs/08 G18).
Build the email confirmation landing (docs/08 G2) and the transactional email templates (G3, G19) in the same visual language.
```

### Phase 9 — Portal setup and branding
```
Build docs/03 section F (Setup, Branding/White-label, Client access) with the rules in docs/05 § Portal setup. Subdomain check against reserved/taken lists and verified domain; non-matching names create a SubdomainReview for Admin. Custom domain with TXT/CNAME instructions and verification job; sending domain SPF/DKIM verification. Go live / Take offline. Setup history.
```

### Phase 10 — Settings + jobs
```
Build docs/03 section G plus docs/08 G6, G7, G10. Background jobs from docs/06 (reminders + escalation, DNS checks, grant expiry, purge, retention deletion). "Next reminder" line in cockpit reads from the job schedule.
```

### Phase 11 — Privacyspace Admin console
```
Open /design/reference/prototypes/Privacyspace Admin.dc.html. Build docs/03 section I with rules from docs/05 § Admin rules and logic from /design/reference/logic/admin-logic.js. Separate /admin auth realm with WebAuthn. Staff endpoints return aggregates only; case data only through active support grants. Build the customer-side grant approval (docs/08 G5) in the workspace. Staff audit log insert-only.
```

### Phase 11b — Billing (provider + admin + customer)
```
Read /design/docs/05 § Billing rules, /design/docs/06 § Payments, /design/docs/04 billing entities. Open Privacyspace Admin.dc.html › Billing & revenue and DSAR Workspace Single Company.dc.html › Settings › Billing & usage.
1. Stripe Billing setup: products/prices from PLANS, metered overage, tax, webhook handler with signature check and idempotency, mirror tables, nightly reconciliation.
2. Admin › Billing & revenue: Revenue (KPIs, cash-by-month chart with text alternative, MRR by plan, needs attention), Subscriptions (table + detail + actions), Payments (filters, refund, totals), Invoices (filters, PDF, reminder, void), Plans & prices. All actions through ReasonDialog with options support; Billing/Admin only; Support read-only.
3. Overview: MRR KPI and "Payment failed" attention items. Organizations detail: Billing line + View billing.
4. Workspace Settings › Billing & usage for workspace admins (change plan, cancel, provider-hosted payment method page, billing details, invoices).
5. Automatic non-payment suspension job (policy days after final failed attempt, warning email the day before) and automatic reactivation on payment (staff retry or Stripe invoice.paid). Track suspensionKind.
6. Usage counting: each new case increments the period's DSAR count and reports metered usage. Never block intake.
```

### Phase 12 — Polish and accessibility pass
```
Apply docs/08 §2 everywhere (motion, keyboard, tracking, StatusLine). Run axe on every route; fix all violations. Verify 44px targets, focus rings, reduced motion, screen-reader labels for case IDs, SLA and pills. Responsive behaviour per docs/08 G12. Compare every screen side by side with the prototypes and fix differences.
```
