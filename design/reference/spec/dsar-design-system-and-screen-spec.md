# DSAR Fulfillment Workspace — Design System & Screen Specification

## 1. Product concept

A focused operational workspace that takes a GDPR data-subject request from intake to a closed, evidence-backed case.

**Core promise:** Close GDPR requests quickly, with human-approved actions and an audit-ready evidence pack—without becoming another system that stores all customer data.

**Primary users:** SaaS CX/Ops teams, founders, DPOs, privacy consultants, and agencies managing client workspaces.

**Design principle:** The case cockpit is the operational hub. A handler should be able to understand request status, SLA risk, outstanding systems, evidence, approvals, and audit history without leaving the case.

---

## 2. Design principles

1. **Evidence first:** Every meaningful action should produce a visible, exportable record.
2. **Human approval by default:** No autonomous deletion or final response without explicit approval.
3. **Deadline awareness:** SLA countdown and risk should always be visible in list and case views.
4. **Calm trust:** Use restrained color, clear hierarchy, and precise language; avoid alarmist UI.
5. **Progressive disclosure:** Show summary states in lists; reveal instructions, evidence, and audit detail on selection.
6. **Role clarity:** Handler, system owner, approver, and admin each see actions appropriate to their permissions.
7. **Auditability:** Sensitive decisions require a reason, actor, timestamp, and immutable log entry.

---

## 3. Visual identity

### Color palette

| Token | Hex | Use |
|---|---|---|
| `color.navy.900` | `#0B1F3A` | Sidebar, headers, primary text on light surfaces |
| `color.navy.700` | `#173A5E` | Hover states, secondary dark surfaces |
| `color.teal.600` | `#0E7C7B` | Primary buttons, active navigation, key progress |
| `color.teal.500` | `#14919B` | Links, icons, focus accents |
| `color.teal.100` | `#D7F0EF` | Selected rows, subtle highlights |
| `color.gray.50` | `#F7F8FA` | App background |
| `color.gray.100` | `#EEF1F4` | Cards, dividers, table headers |
| `color.gray.500` | `#667085` | Secondary text |
| `color.gray.900` | `#101828` | Primary body text |
| `color.success.600` | `#12805C` | Completed, verified, deleted |
| `color.success.100` | `#D9F2E7` | Success backgrounds |
| `color.warning.600` | `#B54708` | Due soon, action required |
| `color.warning.100` | `#FDF0DC` | Warning backgrounds |
| `color.danger.600` | `#B42318` | Overdue, rejected, high risk |
| `color.danger.100` | `#FEE4E2` | Danger backgrounds |
| `color.info.600` | `#175CD3` | Informational states, extensions |
| `color.info.100` | `#D9E8FF` | Informational backgrounds |

### Semantic status colors

| Status | Color | Meaning |
|---|---|---|
| New | Gray | Received but not yet worked |
| Verifying | Info blue | Identity or request validation in progress |
| In progress | Teal | Fulfillment work underway |
| Awaiting approval | Warning amber | Ready for approver review |
| Completed | Success green | Closed with evidence |
| Extended | Info blue | Lawful extension in progress |
| Rejected | Danger red | Request refused or identity verification failed |
| Overdue | Danger red | Statutory deadline breached or imminent |

### Typography

Use one highly legible UI typeface, such as **Inter**, **Public Sans**, or **IBM Plex Sans**.

| Style | Size / weight | Use |
|---|---:|---|
| Display | 32px / 700 | Marketing or empty-state headlines |
| Page title | 24px / 650 | Screen titles |
| Section title | 18px / 600 | Card and panel headings |
| Body | 15px / 400 | Main content |
| Table body | 14px / 400 | Dense lists and tables |
| Caption | 12px / 500 | Metadata, timestamps, helper text |
| Mono | 13px / 500 | Case IDs, file names, API values |

### Spacing and layout

- Base spacing unit: **4px**
- Common spacing: 4, 8, 12, 16, 24, 32, 48px
- App sidebar: **240px**, collapsible to **64px**
- Content max width: **1440px**
- Card padding: **20–24px**
- Table row height: **52–60px**
- Border radius: **8px** for inputs/buttons, **12px** for cards, **16px** for modals
- Elevation: minimal; use 1px borders and subtle shadows for focus, not decoration

### Iconography

Use a consistent 20px outline icon set, such as Lucide or Phosphor.

- Shield: privacy/security
- Clock: SLA and deadlines
- FileText: request or evidence document
- Upload: evidence upload
- EyeOff: redaction
- CheckCircle: completed or approved
- AlertTriangle: action required or risk
- Lock: approval or restricted action
- Building: workspace/client
- History: audit log

---

## 4. Core components

### Buttons

| Variant | Use |
|---|---|
| Primary teal | One main action per view: “Send for approval,” “Generate evidence pack” |
| Secondary outline | Supporting actions: “Save draft,” “Assign tasks” |
| Ghost | Low-emphasis actions: “Cancel,” “Copy case ID” |
| Danger outline | Destructive or restrictive actions: “Reject request” |
| Disabled | Action unavailable until prerequisites are met |

### Status pills

Small rounded labels with icon, label, and semantic color.

Examples: `In progress`, `Awaiting approval`, `High risk`, `Overdue`, `Deleted`, `Retained under exception`.

### SLA indicator

Always show both remaining time and risk state.

- `12 days left` — normal
- `3 days left` — warning
- `Due today` — strong warning
- `Overdue by 2 days` — danger
- Include a thin progress bar beneath the countdown.

### Data table

Used for cases, verification queue, checklist, and task assignment.

Required features:
- Sticky header
- Column sorting
- Saved filters
- Bulk selection where role permits
- Row expansion or right-side detail panel
- Empty state with next action
- Skeleton loading

### Evidence attachment

Show file name, type, uploader, timestamp, and a signed-download action. Sensitive previews should be blurred until intentionally opened.

### Audit trail

Chronological, immutable event feed with:
- Actor
- Action
- Timestamp
- Case/object reference
- Reason where required
- IP or session metadata where appropriate

### Empty states

Each empty state should explain what happens next.

Example: “No cases are awaiting approval. Approved requests will appear here before final response and evidence export.”

---

## 5. Information architecture

```text
App
├── Dashboard
├── DSAR Cases
│   ├── Case list
│   └── Case cockpit
│       ├── Overview
│       ├── Identity verification
│       ├── Data-source checklist
│       ├── Collection & redaction
│       ├── Erasure outcomes
│       ├── Approval & response
│       ├── Evidence pack
│       └── Audit log
├── Approvals
├── Tasks
├── Evidence library
├── Workspaces / Clients
├── Settings
│   ├── Team & roles
│   ├── Data sources
│   ├── SLA & notifications
│   ├── Templates
│   ├── Security & audit
│   └── Billing & usage
└── Public
    ├── DSAR intake form
    ├── Request confirmation
    └── Requester status portal
```

---

## 6. Screen specifications

### 6.1 Public DSAR intake form

**Purpose:** Capture a valid request and create a case.

**Layout:** Single-column, centered card; no app navigation.

**Fields**
- Request type: access, rectification, erasure, portability, objection
- Full name
- Email address
- Account identifier: email, customer ID, phone, or other reference
- Request details
- Optional attachments
- Consent to processing the request
- Anti-spam protection

**Actions**
- `Submit request`
- Confirmation screen with case reference and next steps

**States**
- Validation errors inline
- Duplicate-request warning
- Submission success
- Anti-spam failure

---

### 6.2 Request confirmation email

**Purpose:** Confirm receipt, provide a reference, and begin identity verification.

**Subject:** `We received your data request`

**Structure**
1. Brand header
2. “We’ve received your request under GDPR.”
3. Case reference: `DSAR-2026-00418`
4. Request type and received date
5. Expected response deadline
6. Primary CTA: `Track your request`
7. Secondary CTA: `Verify your identity`
8. Reassurance: “We will use this reference for all updates.”
9. Footer: privacy policy, support contact, disclaimer that the email confirms receipt only and is not legal advice.

---

### 6.3 Requester status portal

**Purpose:** Reduce inbound status emails and provide a secure progress view.

**Content**
- Case reference
- Request type
- Current status
- SLA deadline
- Timeline: received, verifying, in progress, awaiting approval, completed
- Identity-verification prompt if needed
- Secure document-download area when applicable

**Rules**
- Do not expose internal notes, system names, or employee identities.
- Use signed, expiring links for documents.

---

### 6.4 Identity verification queue

**Purpose:** Allow CX/Ops to validate requester identity before fulfillment.

**Layout**
- Summary cards: Awaiting review, High risk, Verified today, Rejected
- Filter bar: status, risk, request type, reviewer
- Main verification table
- Right-side verification detail panel

**Table columns**
- Case ID
- Requester name and email
- Request type
- Account identifier match
- Email verification status
- ID document indicator
- Risk level
- Received date
- SLA countdown
- Assigned reviewer
- Actions

**Detail panel**
- Requester details
- Identifier match results
- Email confirmation status
- Optional ID document preview, with sensitive areas masked
- Reviewer notes
- Actions: `Approve identity`, `Request more information`, `Reject`
- Mandatory reason for rejection or more-information request

**Rules**
- High-risk requests require approver or DPO visibility.
- Every decision is written to the audit log.

---

### 6.5 DSAR case list

**Purpose:** Give the team a single operational queue.

**Layout**
- Left navigation
- Top filters and search
- Case table
- Optional saved views: “My cases,” “Due soon,” “Awaiting approval,” “Overdue”

**Filters**
- Status
- Request type
- Owner
- Approver
- SLA risk
- Workspace/client
- Date received

**Table columns**
- Case ID
- Requester
- Request type
- Status
- Owner
- Received date
- Deadline / SLA countdown
- Checklist progress
- Priority
- Actions

**Primary actions**
- Open case
- Assign owner
- Change status
- Export selected cases

---

### 6.6 Case cockpit

**Purpose:** The central workspace for one DSAR.

**Header**
- Case ID
- Request type
- Requester
- Status pill
- SLA countdown
- Owner and approver
- Primary action: context-dependent, e.g. `Send for approval`

**Tabs**
1. Overview
2. Identity verification
3. Data-source checklist
4. Collection & redaction
5. Erasure outcomes
6. Approval & response
7. Evidence pack
8. Audit log

**Overview content**
- Request summary
- Requester details
- Received and deadline dates
- Checklist progress
- Outstanding blockers
- Internal notes
- Recent audit events

**Rules**
- The primary CTA changes by state:
  - New: `Start verification`
  - Verifying: `Approve identity`
  - In progress: `Send for approval`
  - Awaiting approval: `Approve and close`
  - Completed: `Download evidence pack`

---

### 6.7 Data-source checklist & task assignment

**Purpose:** Coordinate searches and actions across internal and third-party systems.

**Header**
- Case reference
- Request type
- SLA countdown
- Progress: `4 of 7 systems complete`

**Checklist table columns**
- Data source
- System owner
- Search method
- Due date
- Status
- Evidence
- Comments
- Actions

**Statuses**
- Not started
- In progress
- Completed
- Not found
- Action required
- Retained under exception

**Task detail panel**
- Instructions
- Assigned owner
- Due date
- Status selector
- Evidence upload
- Comments
- Audit note

**Bulk actions**
- Assign tasks
- Send reminders
- Change due dates
- Mark as not found, with reason

---

### 6.8 Collection & redaction workspace

**Purpose:** Collect exports, remove third-party or unnecessary personal data, and prepare the response.

**Three-panel layout**
1. File list and upload area
2. Document preview and redaction canvas
3. Redaction log and export controls

**Redaction categories**
- Name
- Email
- Phone number
- ID number
- Third-party personal data
- Confidential free-text note

**Required behavior**
- Redaction reason is mandatory
- Original file remains versioned and access-controlled
- Final export is generated only after redaction review
- Warning appears if third-party data may remain

**Primary actions**
- `Upload file`
- `Apply redaction`
- `Request review`
- `Generate final redacted export`

---

### 6.9 Erasure outcome board

**Purpose:** Record the outcome of an erasure request across every relevant system.

**Board columns**
1. Deleted
2. Suppressed / anonymized
3. Retained under exception
4. Not found
5. Action required

**Card content**
- System name
- Owner
- Outcome date
- Evidence indicator
- Short reason
- Status badge

**Retention exception panel**
- Mandatory reason
- Exception category
- Supporting evidence
- Reviewer note
- Approval requirement

**Rules**
- A case cannot enter approval if any system remains in `Action required`.
- The UI must visually distinguish deletion, suppression, and retention.

---

### 6.10 Approval & response screen

**Purpose:** Ensure a qualified human reviews the case before closure.

**Layout**
- Pre-closure checklist
- Response preview
- Approval panel
- Communication controls

**Pre-closure checklist**
- Identity verified
- All systems searched
- Evidence attached
- Redaction reviewed
- Erasure outcomes resolved
- Response template selected
- Refusal or exception documented, if applicable

**Actions**
- `Approve and close`
- `Request changes`
- `Reject with documented reason`
- `Send response`
- `Copy response for manual send`

**Rules**
- Approver identity and timestamp are mandatory.
- Refusals require a documented reason.
- The platform does not automatically send final responses unless explicitly configured.

---

### 6.11 Evidence pack preview & export

**Purpose:** Produce the audit-ready proof of fulfillment.

**Pack contents**
- Request details
- Identity verification record
- SLA timeline
- Systems searched
- Actions by owner
- Redaction log
- Approvals
- Customer communications
- Final status

**Actions**
- `Preview PDF`
- `Download ZIP`
- `Share signed link`
- `Regenerate pack`

**Rules**
- Evidence pack is never gated behind pricing tiers; it is the core differentiator.
- Export links must expire.
- Regeneration creates a new version while preserving prior versions.

---

### 6.12 Dashboard

**Purpose:** Give managers a daily operational view.

**Widgets**
- Open cases
- Due within 7 days
- Overdue cases
- Awaiting approval
- High-risk verifications
- Action-required systems
- Cases completed this month
- Average time to closure

**Filters**
- Workspace/client
- Date range
- Request type
- Owner

---

### 6.13 Admin: team & roles

**Purpose:** Control access and responsibility.

**Roles**
- Request handler / CX / Ops
- System owner
- Approver / DPO / founder
- Workspace admin
- Agency client workspace user

**Features**
- Invite users
- Assign roles
- Enforce MFA
- Deactivate users
- View role permissions

---

### 6.14 Admin: data sources

**Purpose:** Define where personal data may exist and how it should be checked.

**Fields**
- System name
- Owner
- Search method
- Default instructions
- Evidence requirement
- Default SLA
- Active/inactive state

---

### 6.15 Admin: SLA & notifications

**Purpose:** Keep requests on deadline.

**Settings**
- One-month statutory countdown
- Reminders at days 1, 7, 14, 21, 28, and 30
- Escalation recipients
- Extension workflow
- Customer extension notification

---

### 6.16 Agency workspace switcher

**Purpose:** Let agencies operate across client workspaces.

**Features**
- Workspace switcher in sidebar
- Client logos or names
- Cross-client dashboard
- Per-client role assignment
- White-label portal settings

---

## 7. Key user flows

### Access request

```text
Data subject submits form
→ Confirmation email
→ Identity verification
→ Case created
→ Checklist generated
→ Owners search systems
→ Data collected and redacted
→ Approver reviews
→ Response sent
→ Evidence pack archived
```

### Erasure request

```text
Data subject submits erasure request
→ Identity verification
→ Checklist generated
→ Owners record outcomes
→ Deletion, suppression, retention, or not found recorded
→ Action-required items resolved
→ Approver reviews
→ Human-approved closure
→ Evidence pack archived
```

### Extension workflow

```text
SLA risk detected
→ Handler selects extension
→ Mandatory reason recorded
→ Legal/approver review if required
→ Customer notified
→ New deadline tracked
→ Extension documented in evidence pack
```

---

## 8. Accessibility

- Minimum text contrast: 4.5:1 for body text
- Do not rely on color alone; pair status color with icon and label
- Keyboard navigation for all tables, modals, and task actions
- Visible focus rings using teal
- Screen-reader labels for case IDs, SLA countdowns, and status pills
- Respect reduced-motion preferences
- Target size: minimum 44px for primary touch targets

---

## 9. Content and tone

Use precise, calm, operational language.

**Do say**
- “Identity verification required”
- “3 systems still require action”
- “Approval recorded by [name] at [time]”
- “Evidence pack generated”
- “Retention requires a documented exception”

**Avoid**
- “Guaranteed GDPR compliance”
- “Automatic legal determination”
- “Fully autonomous deletion”
- “AI-approved response”

Include a persistent, plain-language disclaimer where legal expectations could arise:

> This product helps teams manage and document data-subject requests. It does not provide legal advice or guarantee regulatory compliance.

---

## 10. MVP build order

1. Public intake form and confirmation email
2. Case list and case cockpit
3. Identity verification queue
4. Data-source checklist and task assignment
5. Collection and redaction workspace
6. Erasure outcome board
7. Approval and response screen
8. Evidence pack export
9. Dashboard and admin settings
10. Agency multi-client dashboard and white-label portal
