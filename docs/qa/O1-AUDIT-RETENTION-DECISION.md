# O1 - Audit-event retention decision (development orphan rows)

**Status:** DECIDED by the product owner, 2026-10-15. Not a defect; no code change.
**Owner decision, recorded verbatim in substance.** R3 and R4 add no migration and no
automatic purge path as a result of this.

## Context

Nine `audit_events` rows reference workspace IDs that no longer exist. The foreign keys
on `audit_events` were added `NOT VALID`, so pre-existing rows are exempt from them.
`audit_events` is append-only: BEFORE UPDATE/DELETE/TRUNCATE triggers raise `P0001`, so
the rows cannot be deleted through the application roles, and not even by the owner
without deliberately disabling a trigger.

## The nine rows

They self-identify as development data by `action` - `seed` and `commit-test`:

| audit_event id | workspace_id | action | at (UTC) |
|---|---|---|---|
| 6be74c03-4ec4-4e6f-b826-e19aa0ca8c1f | b64fb501-d12d-49e1-9e0b-e2fe3e433b91 | seed | 2026-10-15T08:11:43.299Z |
| fc909b13-91cd-464c-a265-e99b3600db8e | d94ae69b-408f-4b5a-8158-a741c271c208 | seed | 2026-10-15T08:11:43.299Z |
| 3fc6fea1-ff88-4530-87b6-9c3c8782c81c | b64fb501-d12d-49e1-9e0b-e2fe3e433b91 | commit-test | 2026-10-15T08:11:43.320Z |
| 2160dce4-b267-4572-a09a-eb3c461b0514 | 25639928-1366-48ae-80eb-2427fb89a0b9 | seed | 2026-10-15T08:11:46.651Z |
| d3892234-bce9-40d8-b7ea-9c35f1a21d5e | 258926f2-b08e-4c34-97e4-4f3a2635fc93 | seed | 2026-10-15T08:11:46.651Z |
| 7d999f09-5d06-4f14-98be-ed6088b82668 | 25639928-1366-48ae-80eb-2427fb89a0b9 | commit-test | 2026-10-15T08:11:46.670Z |
| 57fd906f-9a3f-4b7f-8226-34f7ace1c4c9 | 15823217-4886-4b42-879b-af7f010b199a | seed | 2026-10-15T08:24:37.541Z |
| 2f5e6a33-20fc-4d08-9d25-547af0746646 | 8db08d32-af3d-4371-81c2-0d0929f3fe55 | seed | 2026-10-15T08:24:37.541Z |
| 3a954e58-3a32-4657-9e54-8fe3db7f0024 | 15823217-4886-4b42-879b-af7f010b199a | commit-test | 2026-10-15T08:24:37.563Z |

## Decision

- **Keep the nine rows for now.** Do not delete them.
- They are development/test-generated audit rows with **no linked production case or
  workspace**.
- They remain **temporarily useful as evidence** that audit-write behaviour, denial
  fidelity, and rollback/commit semantics work.
- They require **no immediate deletion**, because this is a local development database
  and not production customer data.
- **Identified as development/test data** by id and by their `seed` / `commit-test`
  action names. No schema change is made for this: R3 and R4 add no migration, and audit
  rows are immutable by design, so they cannot be marked in place.
- **No automatic purge path will be built for them in R4.**

## Pre-launch requirement (NOT yet implemented)

A documented production audit-retention policy must exist before launch:

- Retain security/audit events only as long as necessary for accountability, dispute
  resolution, and security investigation.
- Use opaque actor/object identifiers where possible.
- Never store request/response bodies, credentials, tokens, presigned URLs, or
  unnecessary personal data.
- Define a concrete retention period and a purge/archival process before production.
- **Any purge must be human-approved and audited; it must never be autonomous.**

## O1 resolution

- The 9 orphaned audit rows are local development/test artifacts.
- They are retained temporarily for verification evidence.
- No automatic deletion is authorized.
- A production audit-retention and human-approved purge policy remains a pre-launch
  requirement.
