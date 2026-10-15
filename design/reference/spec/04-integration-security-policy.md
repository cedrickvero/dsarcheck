# Integration & Data-Handling Policy

## Guiding principle
**Touch less, store less, prove more.**

The product should orchestrate and evidence DSAR workflows without becoming another high-risk repository of customer personal data.

## Customer concern map

| Concern | Mitigation |
|---|---|
| Over-broad access | Minimum OAuth scopes; read-only by default; no full mailbox/admin access |
| Data retention | Transient processing; automatic purge of raw exports after case closure |
| AI training | No customer-data training; AI output is advisory and human-approved |
| Vendor sprawl | Public sub-processor list; DPA; change notifications |
| Deletion reliability | Human-approved actions; explicit deletion/suppression/retention statuses |
| Internal access | RBAC, tenant isolation, least-privilege staff access, audit logs |
| Token compromise | Short-lived tokens, scoped permissions, revocation, monitoring |
| Auditability | Immutable event log and exportable evidence pack |

## Integration tiers

### Tier 1 — Manual evidence workflow
Default mode.

```text
System owner receives task
        ↓
Owner searches their own system
        ↓
Owner uploads evidence / marks status
        ↓
Reviewer approves
        ↓
Evidence pack generated
```

Data exposure: minimal. The platform does not need direct access to customer systems.

### Tier 2 — Scoped read integration
Optional automation.

- OAuth-based connection
- Minimum scopes only
- Search by verified requester identifier
- Retrieve only matching records
- Human review before export or redaction

### Tier 3 — Controlled action integration
Only after demand is validated.

```text
1. Integration finds candidate records
2. Product displays them for review
3. Human selects records
4. Human enters approval reason
5. System executes deletion/suppression
6. Integration returns confirmation
7. Evidence pack stores result
```

Never allow silent or autonomous deletion.

## Recommended v1 connectors
1. Zendesk or Intercom — ticket search/export
2. HubSpot — contact and associated-record search
3. PostgreSQL — customer-controlled query job or customer-hosted read-only agent

## Data-handling rules
- Fetch only records matching a verified requester identifier
- Store raw exports only while the case is open
- Purge raw exports after case closure, e.g. within 30 days
- Retain metadata: request ID, actions, timestamps, actor IDs, hashes, approvals, final status
- Tenant ID on every row
- PostgreSQL row-level security
- Role-based access control
- Encryption at rest and in transit
- Signed, expiring URLs for files
- Customer-configurable retention within defined limits

## AI safeguards
- No training, fine-tuning, or model evaluation on customer data
- Prefer zero-retention model endpoints where available
- Send only minimum necessary text to an LLM
- Human approval required for:
  - Redactions
  - Request classification
  - Deletion decisions
  - Final customer response
- Name AI sub-processors in the DPA and sub-processor list

## Commercial trust package
Before outbound sales, prepare:
1. Public trust center
2. Signable DPA
3. Public sub-processor page
4. Data-flow diagram
5. Integration permission matrix
6. Delete-my-workspace feature
7. Security roadmap: MFA, RBAC, penetration test, vulnerability scanning, backups, SOC 2 / ISO 27001 path

## Sales positioning
> “By default, we do not connect to your systems. We give each data owner a task, they search their own tool, and they upload only what is needed for review. If you want automation, we support scoped, read-only OAuth integrations. We retain raw exports only for the life of the case, then purge them. We retain audit metadata required to evidence the request. Customer data is never used to train AI models.”
