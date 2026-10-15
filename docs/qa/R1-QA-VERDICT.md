# T-R1-QA — QA & Release Verdict for R1 (tenant/audit substrate)

**Ticket:** T-R1-QA
**Owner (role):** qa-release-engineer
**Repo HEAD:** `9ec50e7` — test(r1): close the guardrail follow-ups; APPROVE R1 at risk LOW
**Guardrail status:** APPROVED, risk LOW (3 rounds)
**Date (UTC):** 2026-10-15
**Verdict:** ✅ **R1 PASSES QA** (with 4 documented open items, none blocking)

---

## Provenance — read this before trusting the verdict

The QA role **ran every check and produced all of the raw evidence**. What it could not do was
*deliver*: two delegated runs (attempt 1 `deleg_cf88fff9`, attempt 2 `deleg_3fc888f4`) both ended
with "delegation owner exited before recording a terminal result; outcome unknown". Attempt 1 died
cleaning up dev servers — it killed its own process tree. Attempt 2 wrote its report incrementally
as instructed, so its evidence survived, but only through its section 2, because its remaining
budget went to the production-boot checks attempt 1 had already covered.

So: **the evidence below is the QA role's own recorded output**, quoted from its artifacts and
transcripts. **The verdict was assembled by the orchestrator from that evidence rather than issued
by the QA role itself.** That distinction is stated deliberately — it is the one part of the
process that could not be completed as designed.

---

## 1. Quality gates (all reproduced, all exit 0)

| Gate | Command | Result | Exit |
|---|---|---|---|
| Tests | `npm test` | **30 passed (30)**, 5 files | 0 |
| Type check | `npm run typecheck` | clean | 0 |
| Boundary lint | `npm run lint:boundary` | 43 files, 0 client->server, 0 privileged-handle | 0 |
| DB invariants | `npm run db:verify` | **30/30 invariants hold** | 0 |
| Migrate pipeline | `npm run db:migrate` | migrate + ensure-role + verify all OK | 0 |

---

## 2. Falsification of the invariant gate (the test that matters most)

A gate that cannot fail is not a gate. Both directions were falsified, and **both exit non-zero**:

| Attempt | Setup | Result | Exit |
|---|---|---|---|
| Poisoned | `APP_DATABASE_URL := admin DSN` | **25/30 invariants** | **1** |
| Unset | `APP_DATABASE_URL` unset | **23/24 invariants** | **1** |

The poisoned run catches exactly what it should:

```
x APP session_user is not a superuser            - session_user=hermes
x APP session_user has NOBYPASSRLS
x APP session_user owns no tables                - owns 432
x APP logs in as a separate principal from admin - session_user=hermes
x APP cannot suppress triggers via session_replication_role (B3)
FAILED: 5 invariant(s) not satisfied
```

**The gate has teeth and fails closed** — the direct contrast with the vacuous boundary check the
first guardrail review found.

---

## 3. Independent tenant-isolation & audit-immutability probe — 24/24

**Method (important).** Two orgs / two workspaces created over the admin DSN, used for **setup
only**. Every isolation **read** runs as `app_tenant` inside its own transaction
(`BEGIN; SET LOCAL ROLE app_tenant; SET LOCAL app.workspace_id=<uuid>; ...; ROLLBACK`), never as the
superuser. Every **mutating** attempt runs in its **own fresh transaction**, so a refusal can never
be an artefact of a previously-aborted transaction — precisely attempt 1's harness bug, reproduced
and fixed.

```
PASS  as wsA: sees its OWN audit row                    - own=1
PASS  as wsA: total audit rows == own only              - total=1
PASS  as wsA: cross-tenant audit read == 0 (wsB)        - wsB=0
PASS  as wsA: workspaces visible == 1 (own)             - visible=1
PASS  as wsA: orgs visible == 1 (own org)               - visible=1
PASS  as wsA: cross-tenant INSERT rejected              - 42501 new row violates RLS policy
PASS  as wsA: own-tenant INSERT succeeds (write works)  - id=7be1b6bf-...
PASS  GUC unset: audit_events / workspaces / orgs fail closed (0 rows each)
PASS  APP:   UPDATE / DELETE / TRUNCATE refused
PASS  ADMIN: UPDATE / DELETE / TRUNCATE refused
PASS  audit rows intact after all refused mutations     - found=2
PASS  attribution CHECK rejects blank actor_id
PASS  FK rejects audit row -> nonexistent workspace

TOTAL: 24 passed, 0 failed
```

Strongest pair: `UPDATE`/`DELETE` are refused by the trigger **for the admin/owner too**, while
`TRUNCATE` is refused by the statement trigger. Append-only therefore holds against the owner; only
a privileged operator using replica mode remains, which is the documented residual (O4).

---

## 4. Runtime surface

| Check | Result |
|---|---|
| Production build | exit 0 (13.1s) |
| Production boot assertion | `db: application principal "app_runtime" is least-privilege` |
| `/api/health`, `/api/health/ready`, `/health`, `/health/ready` | 200 / 200 `{status:ready,db:up}` |
| Privileged DSN in production | **hard boot failure**; health/ready -> **500** |
| HTTP leakage | 10/10 clean; no connection strings, passwords or stack traces |
| `x-request-id` | present on every response and echoed |
| Stub routes | **55** (11 routes x 5 methods), all 501 with the standard envelope |
| No route calls `mutate()` | confirmed by grep across `src/` |
| `systemDb`/`systemPool` | only in `db/client.ts` + tests (boundary rule 2 enforces) |

---

## 5. Failed tests with reproduction steps

**None.** One `FAIL ::` appears in attempt 1's transcript; it was a **bug in the QA probe itself**
(its helper always rolled back, so it misread its own write as failed), self-diagnosed and
corrected, then re-run to 24/24. Not a product defect; no reproduction against the product.

---

## 6. Security & privacy regression checklist

| # | Check | Result |
|---|---|---|
| 1 | Tenant isolation enforced by Postgres RLS, not app code | PASS — 24/24 |
| 2 | RLS forced (owner not exempt) | PASS — 3/3 tables |
| 3 | Fails closed with no tenant set | PASS — 0 rows |
| 4 | Cross-tenant write rejected | PASS — 42501 |
| 5 | Audit append-only vs UPDATE/DELETE | PASS — app **and** admin refused |
| 6 | Audit append-only vs TRUNCATE | PASS — statement trigger |
| 7 | Runtime principal least-privilege (`session_user`) | PASS — `app_runtime`, non-super, NOBYPASSRLS, owns 0 |
| 8 | Privilege escalation via `RESET ROLE` denied | PASS |
| 9 | Trigger suppression via replica mode denied | PASS |
| 10 | Privileged DSN detectable and fatal in production | PASS — boot fails, readiness 500 |
| 11 | Invariant gate fails when invariants are broken | PASS — exit 1 both directions |
| 12 | No secrets/PII in responses or boot logs | PASS |
| 13 | No request path reaches the privileged pool | PASS — static rule + grep |
| 14 | RBAC | **N/A by design** — `requireAuth()`/`can()` throw 501; no route calls `mutate()` |
| 15 | SLA / reminders / escalation / evidence-pack / deletion | **N/A by design** — clean 501s |

---

## 7. Release notes

R1 delivers the substrate every later slice builds on:

- **`audit_events`** — append-only, attribution-complete, tenant-integrity constrained
  (FKs + CHECK), with statement-level TRUNCATE protection.
- **Row-level security** — enabled *and forced* on `audit_events`, `orgs`, `workspaces`, keyed on
  the `app.workspace_id` GUC, failing **closed**.
- **Two-principal database access** — the application logs in as `app_runtime`; the admin/owner DSN
  is reserved for migrations and verification, and is statically guarded.
- **`mutate()`** — the single sanctioned mutation path: authorization -> Zod -> one transaction
  containing change + audit event. Not yet called by any route.
- **`db:migrate` now enforces** — applies migrations, provisions the runtime role, verifies 30
  invariants, and exits non-zero on drift.

Deliberately absent from R1: RBAC, SLA, evidence packs, deletion workflows.

---

## 8. Deployment checklist — requires explicit human approval

Nothing below may be executed autonomously.

- [ ] **Human approval recorded** for this deployment (this document is a request, not a consent).
- [ ] `APP_DB_PASSWORD` set to a real secret — **not** the dev default.
- [ ] `APP_DATABASE_URL` set and distinct from the admin `DATABASE_URL`.
- [ ] `DATABASE_URL` (admin/owner) **not** exposed to the application runtime.
- [ ] `npm run db:migrate` run and observed to print `30/30 invariants hold`.
- [ ] Production boot verified to fail closed on a privileged DSN (do not skip).
- [ ] Readiness returns 200 `{status:"ready",db:"up"}` and `x-request-id` is echoed.
- [ ] No `systemDb`/`systemPool` import outside `db/client.ts` (boundary rule 2).
- [ ] Retention decision recorded for the orphaned audit rows (O1).

---

## 9. Open items (none block R1; all have owners)

| # | Item | Severity | Owner / target |
|---|---|---|---|
| O1 | 9 historical audit rows reference a deleted workspace. FKs are `NOT VALID`, so this history is unenforced. Reported by `db:verify`, deliberately not deleted (append-only). | Low | **Retention decision owed by the product owner** |
| O2 | `mutate()`'s transaction path is unexercised end-to-end because `requireAuth()` throws 501. | Medium | Hard gate: **no route may call `mutate()` before T-08** |
| O3 | `app.workspace_id` is caller-supplied, not bound to the authenticated actor. | Medium | Hard requirement in **T-08** |
| O4 | A privileged operator can still suppress the append-only trigger via replica mode or owner DDL. | Low | Accepted residual; claims worded "append-only for all non-owner roles" |

---

**Verdict on evidence: R1 PASSES QA.**
Three rounds of guardrail review (CRITICAL -> LOW) and a complete QA evidence set — with the
provenance caveat in section 0 stated openly rather than hidden.
