# MVP A Specification — DSAR Fulfillment Cockpit

## Objective
Build the minimum product required to take a GDPR request from intake to a closed, evidence-backed case.

## Primary user roles
| Role | Responsibility |
|---|---|
| Data subject | Submits and tracks a request |
| Request handler / CX / Ops | Collects data, updates tasks, prepares response |
| System owner | Searches their own system and records the result |
| Approver / DPO / founder | Reviews and approves closure |
| Workspace admin | Configures systems, users, SLA, templates |

## Core workflow
```text
Customer submits request
        ↓
Identity + request validation
        ↓
Case created with SLA countdown
        ↓
System checklist generated
        ↓
Tasks assigned to owners
        ↓
Data collected / reviewed / redacted
        ↓
Approval + customer response
        ↓
Evidence pack archived
```

## Must-have features

### 1. Request intake
- Hosted public intake form
- Request types: access, rectification, erasure, portability, objection
- Capture requester name, email, account identifiers, request details, attachments
- Anti-spam protections
- Request confirmation email
- Customer-facing request-status portal

### 2. Identity verification
- Email confirmation link
- Account identifier match
- Optional ID document upload
- Manual reviewer approval
- Risk status: low, medium, high
- Reject or request-more-information workflow

### 3. Case management
- Unique case ID
- Request type
- Requester details
- Received date
- Statutory deadline
- Status: new, verifying, in progress, awaiting approval, completed, extended, rejected
- Internal notes
- Immutable audit log

### 4. SLA tracking
- One-month countdown from receipt
- Reminders at day 1, 7, 14, 21, 28, and 30
- Escalation alerts
- Extension workflow with reason and customer communication
- Maximum extension: two additional months, subject to legal review and customer notification

### 5. Data-source checklist
- Configurable list of systems where personal data may exist
- Fields: system name, owner, search method, due date, status, evidence
- Default statuses: not started, in progress, completed, not found, action required, retained under exception
- Task assignment and due dates
- Comments and file attachments

### 6. Collection and redaction
- Upload exports or supporting files
- Highlight and redact:
  - Names
  - Emails
  - Phone numbers
  - IDs
  - Third-party personal data
  - Free-text confidential notes
- Redaction reason log
- Final redacted export generation

### 7. Erasure workflow
- Per-system outcome:
  - Deleted
  - Suppressed / anonymized
  - Retained under legal exception
  - Not found
  - Action required
- Mandatory reason for each outcome
- Human approval before closure
- Clear distinction between deletion, suppression, and retention

### 8. Approval and response
- Pre-closure review checklist
- Approver identity and timestamp
- Response templates by request type
- Manual send or copy-to-send workflow
- Refusal/exception workflow with documented reason

### 9. Evidence pack
- PDF and ZIP export
- Request details
- Identity verification record
- SLA timeline
- Systems searched
- Actions taken by owner
- Redaction log
- Approvals
- Customer communication
- Final status

## Nice-to-have features
- AI request classification
- AI redaction suggestions
- AI case summary
- AI-drafted response, human-approved
- Zendesk or Intercom integration
- HubSpot integration
- Slack notifications
- API and webhooks
- Multi-client agency dashboard
- White-label customer portal

## Explicit exclusions in v1
- Autonomous deletion
- Full mailbox access
- Direct database credentials stored by the platform
- AI training on customer data
- Automated legal determinations
- Broad enterprise data discovery

## Technical architecture

### Stack
- Docker / Docker Compose
- Node.js + TypeScript
- PostgreSQL
- Redis
- Object storage for encrypted case files
- Background workers for reminders, exports, and integrations

### Data model — minimum entities
- `workspace`
- `user`
- `role`
- `dsar_request`
- `requester`
- `identity_verification`
- `data_source`
- `task`
- `task_evidence`
- `redaction`
- `approval`
- `audit_event`
- `notification`
- `evidence_pack`

### Security requirements
- Tenant isolation on every record
- PostgreSQL row-level security
- Role-based access control
- MFA for workspace users
- Encryption at rest and in transit
- Signed, expiring URLs for uploaded files
- Audit logging for all sensitive actions
- Data-retention controls
- Workspace deletion workflow
