# T-R1-QA — QA & Release Verdict for R1 (tenant/audit substrate)

**Ticket:** T-R1-QA
**Owner (role):** qa-release-engineer
**Subject:** commit `9ec50e7` (R1) + the F-1 fix
**Date (UTC):** 2026-10-15
**Current verdict:** ✅ **R1 PASSES QA** — *after* the F-1 blocker was fixed and the dev-mode path re-verified
**Prior verdict:** ❌ **R1 FAILS QA** (F-1, `npm run dev` served HTTP 500 on every route)

---

## 0. Correction notice — an earlier version of this file was wrong

An earlier revision of this document (commit `1b13a6e`, 09:30) recorded **"R1 PASSES QA"**. **That
was incorrect and is retracted.**

It was written by the orchestrator from *partial* evidence: two delegated QA runs had been reported
as "outcome unknown", and the verdict was assembled from the artifacts those runs had left behind.
That evidence set was **missing the dev-server check (task item 8)** entirely. Attempt 1 had in fact
gone on to complete — 30 minutes, 86 API calls — and delivered the missing check as a **BLOCKER**:

> **F-1 (BLOCKER) — `npm run dev` serves HTTP 500 for every route.**

**Lesson, recorded deliberately:** an assembled verdict is only as complete as the evidence it is
assembled from, and "outcome unknown" must not be treated as "finished". A partial-evidence PASS is
worth less than no verdict at all, because it invites building on an unverified base.

---

## 1. F-1 — the blocker, its root cause, and its fix

### Symptom

```
GET /api/health   -> 500   (expected 200)
GET /health       -> 500   (expected 200)
GET /api/cases/x  -> 500   (expected 501 envelope)
```

Blast radius: `docker-compose.yaml` runs the API service as `command: npm run dev`, and the
`Dockerfile` sets `CMD ["npm","run","dev"]` with `ENV NODE_ENV=development`. The shipped stack — and
every R2–R4 developer — would have had an API that 500s on every request.

### Root cause (isolated by controlled A/B experiment, not inference)

```
x ./node_modules/dotenv/lib/main.js:2:1  Module not found: Can't resolve 'path'
  Import trace: dotenv/config -> src/env.ts -> src/db/client.ts -> src/instrumentation.ts
```

`next dev` compiles `instrumentation.ts` for the **edge** runtime as well as nodejs. R1's guard used
a *negative* form — `if (process.env.NEXT_RUNTIME !== "nodejs") return;` followed by a top-level
`await import("@/db/client")` — which is **not** dead-code-eliminated for the edge build. The entire
node-only chain (`@/db/client -> @/env -> dotenv/config`, which requires `path`) was therefore pulled
into the edge bundle and failed to resolve.

The QA role ruled out the confounds explicitly: `next.config.ts` and `env.ts` are byte-identical to
`137b293`; `137b293` (no `instrumentation.ts`) serves 200 on the same filesystem; HEAD 500s on both
ext4 and virtiofs.

### Fix

Wrap the import in the **positive** form, which *is* eliminated from the edge build:

```ts
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertLeastPrivilege } = await import("@/db/client");
    ...
  }
}
```

### Verification after the fix

| Mode | Check | Result |
|---|---|---|
| dev | `/health` | **200** `{"status":"ok"}` |
| dev | `/health/ready`, `/api/health`, `/api/health/ready` | **200** |
| dev | `/api/health/ready` body | `{"status":"ready","db":"up"}` |
| dev | `/api/cases/x` | **501** + `{error:{code,message,requestId}}` |
| dev | `/nope` | **404** |
| dev | `x-request-id` | present and echoed |
| dev | boot log | `Compiled /instrumentation in 1629ms` — **no** "Module not found" |
| dev | boot assertion | `db: application principal "app_runtime" is least-privilege (superuser=false, bypassrls=false, owns=0)` |
| prod | privileged DSN | **FAILS CLOSED** — boot aborts, `/health` and `/api/health/ready` -> **500** |

The production result is the one that mattered: the fix made the **negative** guard positive without
weakening the control. The assertion still refuses a privileged connection:

```
db: least-privilege assertion FAILED: refusing to run with a privileged connection —
session_user is a superuser; session_user has BYPASSRLS; session_user owns 432 table(s);
session_user is the configured owner role (hermes)
Failed to prepare server: error while loading instrumentation hook
```

---

## 2. Quality gates (after the fix)

| Gate | Command | Result | Exit |
|---|---|---|---|
| Tests | `npm test` | **30 passed (30)**, 5 files | 0 |
| Type check | `npm run typecheck` | clean | 0 |
| Boundary lint | `npm run lint:boundary` | 43 files, 0 client->server, 0 privileged-handle | 0 |
| DB invariants | `npm run db:verify` | **30/30 invariants hold** | 0 |
| Migrate pipeline | `npm run db:migrate` | migrate + ensure-role + verify | 0 |
| Production build | `npm run build` | exit 0, all 17 routes | 0 |
| Dev server | `npm run dev` | **200/501/404 correct** | — |

---

## 3. Falsification of the invariant gate

| Attempt | Setup | Result | Exit |
|---|---|---|---|
| Poisoned | `APP_DATABASE_URL := admin DSN` | **25/30** | **1** |
| Unset | `APP_DATABASE_URL` unset | **23/24** | **1** |

The poisoned run catches exactly the right failures: `session_user=hermes`, superuser, `owns 432
tables`, not a separate principal, and replica-mode trigger suppression permitted.

**The gate has teeth and fails closed** — the direct contrast with the vacuous boundary check found
in the first guardrail review.

---

## 4. Independent tenant-isolation & audit-immutability probe — 24/24

Two orgs / two workspaces created over the admin DSN (**setup only**). Every isolation **read** runs
as `app_tenant` inside its own transaction; every **mutating** attempt runs in its **own fresh
transaction**, so a refusal can never be an artefact of an aborted transaction.

```
PASS  as wsA: sees its OWN audit row / total == own only
PASS  as wsA: cross-tenant audit read == 0; other workspace row invisible
PASS  as wsA: cross-tenant INSERT rejected (42501 RLS)
PASS  as wsA: own-tenant INSERT succeeds
PASS  GUC unset: audit_events / workspaces / orgs fail closed (0 rows each)
PASS  APP and ADMIN: UPDATE / DELETE refused (row trigger)
PASS  APP: TRUNCATE refused (privilege); ADMIN: TRUNCATE refused (statement trigger)
PASS  audit rows intact after all refused mutations
PASS  attribution CHECK rejects blank actor_id
PASS  FK rejects audit row -> nonexistent workspace
TOTAL: 24 passed, 0 failed
```

The QA role also confirmed the superuser trap directly: the admin sees 44 rows where a tenant sees 1.

---

## 5. Failed tests

**F-1 — the only product failure. Fixed and re-verified.** Reproduction is documented in section 1
and now yields 200/501.

One earlier `FAIL ::` was a bug in the QA probe itself (its helper always rolled back, so it
misread its own write as failed), self-diagnosed and corrected. Not a product defect.

---

## 6. Security & privacy regression checklist

| # | Check | Result |
|---|---|---|
| 1 | Tenant isolation by Postgres RLS, not app code | PASS — 24/24 |
| 2 | RLS enabled **and forced** (owner not exempt) on 3 tables | PASS |
| 3 | Fails **closed** with no tenant set | PASS — 0 rows |
| 4 | Cross-tenant read = 0; cross-tenant write rejected | PASS — 42501 |
| 5 | Audit append-only vs UPDATE/DELETE | PASS — app **and** admin/owner refused |
| 6 | Audit append-only vs TRUNCATE | PASS — statement trigger + revoked privilege |
| 7 | Runtime principal least-privilege (`session_user`) | PASS — `app_runtime`, non-super, NOBYPASSRLS, owns 0 |
| 8 | `RESET ROLE` / replica-mode escalation denied | PASS — and flagged by `db:verify` when violated |
| 9 | Privileged DSN fatal in production | PASS — hard boot failure, 500 |
| 10 | Invariant gate fails when invariants break | PASS — exit 1 both directions |
| 11 | No secrets/PII/DSN in responses or boot logs | PASS — 10/10 HTTP checks clean |
| 12 | No request path reaches the privileged pool | PASS — grep + boundary rule 2 |
| 13 | No route calls `mutate()` | PASS — grep across `src/` |
| 14 | 11 stub routes return 501 with envelope + `x-request-id` | PASS — verified live, 22/22 GET+POST combos |
| 15 | RBAC / SLA / evidence-pack / deletion | **N/A by design** — clean 501s |
| 16 | `npm run dev` serves requests | **PASS after F-1 fix** |

---

## 7. Release notes

R1 delivers the substrate R2–R4 build on, and every security claim it makes is verified true:

- `audit_events` append-only (row trigger for UPDATE/DELETE, statement trigger for TRUNCATE),
  attribution CHECK, tenant-integrity FKs (`NOT VALID`).
- RLS enabled **and forced** on `audit_events`/`orgs`/`workspaces`, keyed on `app.workspace_id`,
  failing **closed**.
- Two principals: the app **logs in** as `app_runtime` (NOBYPASSRLS, non-owner, no DDL/TRUNCATE);
  the admin DSN is statically confined to migrations and verification.
- `mutate()` (authz -> zod -> one transaction with the audit event) exists and is deliberately
  uncalled.
- `npm run db:migrate` = migrate + provision runtime role + verify 30 invariants, exiting non-zero
  on drift.
- All 11 product routes are 501 stubs with the standard envelope.

**R1 is shippable as of the F-1 fix.** It was not shippable before it.

---

## 8. Deployment checklist — requires explicit human approval

Nothing below may be executed autonomously.

- [ ] **Human approval recorded** for this deployment (this document is a request, not consent).
- [ ] `npm run dev` verified to return 200 on `/health` and 501 envelopes on stubs (F-1 regression).
- [ ] `APP_DB_PASSWORD` set to a real secret — not the dev default.
- [ ] `APP_DATABASE_URL` set and distinct from the admin `DATABASE_URL`.
- [ ] Admin `DATABASE_URL` not exposed to the application runtime.
- [ ] `npm run db:migrate` run and observed to print `30/30 invariants hold`.
- [ ] Production boot verified to fail closed on a privileged DSN (do not skip).
- [ ] Readiness returns `200 {status:"ready",db:"up"}` and `x-request-id` is echoed.
- [ ] No `systemDb`/`systemPool` import outside `db/client.ts`.
- [ ] Retention decision recorded for the orphaned audit rows (O1).

---

## 9. Open items (none blocking)

| # | Item | Severity | Owner / target |
|---|---|---|---|
| O1 | 9 historical audit rows reference a deleted workspace (FKs `NOT VALID`, reported not fatal, deliberately not deleted). | Low | **Retention decision owed by the product owner** |
| O2 | `mutate()`'s transaction path is unexercised end-to-end (`requireAuth()` throws 501). | Medium | Hard gate: **no route may call `mutate()` before T-08** |
| O3 | `app.workspace_id` is caller-supplied, not bound to the authenticated actor. | Medium | Hard requirement in **T-08** |
| O4 | A privileged operator can still suppress the append-only trigger via replica mode or owner DDL. | Low | Accepted residual; claims worded "append-only for all non-owner roles" |
| O5 | `toErrorEnvelope` logs a source code-frame + stack for every >=500, including intentional 501s — internal only, but noisy and misleading in production logs. | Low | Backlog |
| O6 | Readiness `db:"down"` is only reachable for a DB that fails *after* a successful boot (boot asserts privilege and throws first in production). | Low | Backlog |

---

**Verdict: R1 PASSES QA** — three rounds of guardrail review (CRITICAL -> LOW), one QA blocker found
and fixed, and the correction in section 0 stated openly rather than quietly overwritten.
