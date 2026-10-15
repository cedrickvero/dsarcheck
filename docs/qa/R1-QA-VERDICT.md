# T-R1-QA — QA & Release Verdict for R1 (tenant/audit substrate)

**Ticket:** T-R1-QA — verdict **re-issued** after the F-1 fix
**Subject:** commit `16ce851` (includes the F-1 fix)
**Date (UTC):** 2026-10-15
**Verdict:** ✅ **R1 PASSES QA**

---

## 0. Provenance — read this first

This verdict is a **re-issue** after a blocker. The path here was not clean, and the record should show it:

| Round | Who | Result |
|---|---|---|
| QA attempt 1 (`deleg_cf88fff9`) | qa-release-engineer | ❌ **FAILS QA** — F-1, `npm run dev` served HTTP 500 on every route. Its result was lost in delivery and only recovered hours later. |
| Assembled verdict (`1b13a6e`) | orchestrator, from **partial** evidence | ⚠️ claimed PASSES QA — **wrong, retracted.** It had no dev-server check at all. |
| F-1 fix (`16ce851`) | repo owner | Positive `NEXT_RUNTIME === "nodejs"` guard; README corrected; retraction recorded. |
| DB half re-verification (`deleg_3ac87513`) | qa-release-engineer | ✅ **DB HALF: PASS** |
| Behavioural half re-verification | orchestrator, reproduced directly | ✅ PASS |

**Division of independence, stated plainly:** the **database half is independently verified by the QA
role**. The **behavioural half was reproduced by the orchestrator**, not by an independent role —
delegation lost that delivery twice, so the checks were re-run directly. Every number below is backed
by a command and its raw output, but the reader should know which half carried independent eyes.

**Lesson recorded:** "outcome unknown" is not "finished". Attempt 1 completed 30 minutes later and
delivered the blocker that a partial-evidence verdict had missed.

---

## 1. F-1 — the blocker (fixed)

`npm run dev` returned HTTP 500 for **every** route.

**Root cause** (isolated by the QA role with a controlled A/B experiment): `next dev` compiles
`instrumentation.ts` for the **edge** runtime as well as nodejs. The negative form —
`if (process.env.NEXT_RUNTIME !== "nodejs") return;` followed by a top-level `await import("@/db/client")`
— is **not** dead-code-eliminated for the edge build, so the node-only chain
(`@/db/client -> @/env -> dotenv/config`, which requires `path`) was pulled into the edge bundle:

```
Module not found: Can't resolve 'path'
  Import trace: dotenv/config -> src/env.ts -> src/db/client.ts -> src/instrumentation.ts
```

Ruled out by experiment: `137b293` (no `instrumentation.ts`) serves 200 on the same filesystem; HEAD
500s on **both** ext4 and virtiofs, so the filesystem was not the cause.

**Blast radius:** `docker-compose.yaml` runs the API as `npm run dev`, and the `Dockerfile` `CMD` is
`npm run dev`. The shipped stack would have 500'd on every request. **R1 was un-shippable.**

**Fix:** wrap the import in the positive form, which *is* eliminated from the edge build.

Before (broken — not eliminated, edge bundle pulls in the node-only chain):

```ts
if (process.env.NEXT_RUNTIME !== "nodejs") return;          // negative guard: NOT eliminated
const { assertLeastPrivilege } = await import("@/db/client");
```

After:

```ts
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {               // positive guard: IS eliminated
    const { assertLeastPrivilege } = await import("@/db/client");
    ...
  }
}
```

The QA role verified this exact rewrite in an isolated worktree before it was committed: `✓ Compiled
/instrumentation`, `/api/health` 200, `/api/cases/x` 501 with the standard envelope.

---

## 2. Behavioural half (reproduced at `16ce851`)

### Dev mode — the entrypoint that ships

| Route | Result |
|---|---|
| `/health` | **200** `{"status":"ok"}` |
| `/health/ready` | **200** |
| `/api/health` | **200** `{"status":"ok"}` |
| `/api/health/ready` | **200** `{"status":"ready","db":"up"}` |
| `/api/cases/x` | **501** `{"error":{"code":"not_implemented","message":...,"requestId":...}}` |
| `/nope` | **404** |
| `x-request-id: traced-abc-123` | echoed |
| boot log | `Compiled /instrumentation in 1817ms (151 modules)` — **no** Module-not-found |
| boot assertion | `db: application principal "app_runtime" is least-privilege (superuser=false, bypassrls=false, owns=0)` |

### Production

| Check | Result |
|---|---|
| `npm run build` | exit 0, 17 routes |
| Boot with a **privileged** DSN | **FAILS CLOSED** — assertion aborts boot, `/health` **500**, `/api/health/ready` **500** |

Fix confirmed to make the guard positive **without weakening the control** — the one regression risk
the change carried.

### Failed tests

**F-1 (BLOCKER) — `npm run dev` served HTTP 500 on every route. Fixed at `16ce851`, re-verified above.**

Reproduction (as the QA role reported it, before the fix):

```bash
source /opt/data/bin/repoenv.sh
cd $REPO/api && rm -rf .next
npm run dev
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/health   # 500 (expected 200)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/health       # 500 (expected 200)
curl -s -m 5 http://127.0.0.1:3000/api/cases/x                              # 500 HTML (expected 501 envelope)
```

One other `FAIL ::` appeared during an earlier probe; it was a bug in the probe itself (its helper
always rolled back, so it misread its own write as failed), self-diagnosed and corrected. **Not a
product defect, no reproduction against the product.**

---

## 3. Database half — independent QA re-verification (`deleg_3ac87513`)

Evidence: `/opt/data/qa-tmp/REVERIFY.md` (276 lines, command + raw output per check) plus 9 probe
scripts and their logs.

*History: an earlier independent probe at `9ec50e7` passed 24/24 isolation + immutability checks
(and 20/20 in the round before it, with the difference explained by a better per-transaction method).
The run below supersedes both.*

| # | Item | Result |
|---|---|---|
| 1 | Tenant isolation, two workspaces | **PASS 19/19** (+5/5 supplement) |
| 2 | Audit immutability UPDATE/DELETE/TRUNCATE, both principals | **PASS 11/11** |
| 3 | Tenant-integrity FK + attribution CHECK | **PASS 18/18** |
| 4 | Invariant-gate falsification, both directions | **PASS** — exit **0 / 1 / 1** |
| 5 | Runtime principal least-privilege + escalation refusals | **PASS 17/17** |

**Highlights**

- **Fail-closed proven three ways:** GUC unset / GUC `''` / unknown uuid → **0 rows**; GUC-less INSERT → **42501**.
- **Symmetric isolation:** each workspace sees exactly its own audit row, 1 workspace, its own org; cross-tenant read = 0; cross-tenant INSERT into `audit_events`/`workspaces`/`orgs` → **42501**; own-tenant INSERT succeeds (positive control).
- **The trigger, not privilege, enforces append-only:** UPDATE/DELETE hit the BEFORE row trigger (`P0001 append-only`) on **all three principals including superuser/owner `hermes`**. TRUNCATE refused to app roles by privilege (`42501`) and to the owner by the BEFORE TRUNCATE trigger (`P0001`). Row count unchanged 65 → 65.
- **Constraints enforced despite `NOT VALID`:** both FKs reject new bad writes (`23503`); the attribution CHECK rejects blank **and** whitespace-only in all 6 fields (`23514`); NULL → `23502`.
- **Principal:** `app_runtime` non-superuser, NOBYPASSRLS, owns 0 tables/schemas; `RESET ROLE` stays on `app_runtime`; `SET ROLE hermes`, `session_replication_role=replica`, DISABLE TRIGGER, DROP/ALTER, CREATE TABLE/ROLE all refused (`42501`).

**Gate falsification — the QA role's exit codes match the orchestrator's independently:**

| Run | Result | Exit |
|---|---|---|
| Normal | 30/30 | **0** |
| `APP_DATABASE_URL := admin DSN` | 25/30 (5 falsified, incl. `session_user=hermes`, `owns 432`) | **1** |
| `APP_DATABASE_URL` unset | 23/24 | **1** |

**State explicitly what was NOT verified by that run** (as the QA role itself did): the behavioural
half (out of scope for it); the `withTenant()` helper's *wiring* (only its DB substrate); `db:migrate`
(mutating — not run); production pool/DSN parity; and an owner-*member* role (none exists).

---

## 4. Quality gates at `16ce851`

| Gate | Result |
|---|---|
| `npm test` | **30 passed (30)**, 5 files |
| `npm run typecheck` | exit 0 |
| `npm run lint:boundary` | 43 files, 0 client->server, 0 privileged-handle |
| `npm run db:verify` | **30/30 invariants hold** |
| `npm run build` | exit 0, 17 routes |
| `npm run dev` | 200 / 501 / 404 correct |

---

## 5. Security & privacy regression checklist

| # | Check | Result |
|---|---|---|
| 1 | Tenant isolation by Postgres RLS, not app code | PASS — 19/19 + 5/5 |
| 2 | RLS enabled **and forced** (owner not exempt) on 3 tables | PASS |
| 3 | Fails **closed** with no tenant set | PASS — 3 ways, 0 rows |
| 4 | Cross-tenant read = 0; cross-tenant write rejected | PASS — 42501 |
| 5 | Audit append-only vs UPDATE/DELETE | PASS — app, admin **and** owner refused |
| 6 | Audit append-only vs TRUNCATE | PASS — trigger (owner) + privilege (app) |
| 7 | Runtime principal least-privilege (`session_user`) | PASS — owns 0 tables/schemas |
| 8 | `RESET ROLE` / replica-mode / DISABLE TRIGGER escalation | PASS — all refused |
| 9 | Privileged DSN fatal in production | PASS — hard boot failure, 500 |
| 10 | Invariant gate fails when invariants break | PASS — exit 1 both directions |
| 11 | No secrets/PII/DSN in responses or boot logs | PASS |
| 12 | No request path reaches the privileged pool | PASS — grep + boundary rule 2 |
| 13 | No route calls `mutate()` | PASS |
| 14 | 11 stub routes: 501 + envelope + `x-request-id` | PASS |
| 15 | RBAC / SLA / evidence-pack / deletion | **N/A by design** |
| 16 | `npm run dev` serves requests | **PASS after the F-1 fix** |

---

## 6. Release notes

R1 delivers the substrate R2–R4 build on:

- `audit_events` append-only — enforced by DB triggers against **every** principal including the owner.
- RLS enabled **and forced** on `audit_events`/`orgs`/`workspaces`, keyed on `app.workspace_id`, failing closed three ways.
- Two principals: the app **logs in** as `app_runtime`; the admin DSN is statically confined to migrations and verification.
- `mutate()` (authz -> zod -> one transaction containing the audit event) exists and is deliberately uncalled.
- `npm run db:migrate` = migrate + provision runtime role + verify 30 invariants, exiting non-zero on drift.
- All 11 product routes are 501 stubs with the standard envelope.

**R1 is shippable as of `16ce851`.** It was not shippable before it.

---

## 7. Deployment checklist — requires explicit human approval

Nothing below may be executed autonomously.

- [ ] **Human approval recorded** for this deployment (this document is a request, not consent).
- [ ] `npm run dev` verified to return 200 on `/health` and 501 envelopes on stubs (F-1 regression guard).
- [ ] `APP_DB_PASSWORD` set to a real secret — not the dev default.
- [ ] `APP_DATABASE_URL` set and distinct from the admin `DATABASE_URL`.
- [ ] Admin `DATABASE_URL` not exposed to the application runtime.
- [ ] `npm run db:migrate` run and observed to print `30/30 invariants hold`.
- [ ] Production boot verified to fail closed on a privileged DSN (do not skip).
- [ ] Readiness returns `200 {status:"ready",db:"up"}` and `x-request-id` is echoed.
- [ ] No `systemDb`/`systemPool` import outside `db/client.ts`.
- [ ] Retention decision recorded for the orphaned audit rows (O1).

---

## 8. Open items (none blocking)

| # | Item | Severity | Owner / target |
|---|---|---|---|
| O1 | **9 audit rows across 6 ghost `workspace_id`s** survive because the FKs are `NOT VALID`. Unreachable by any live tenant (RLS keys on `app.workspace_id`) and warned about by `db:verify`, but the history is unenforced. Deliberately **not** deleted — append-only forbids it. | Low | **Retention decision owed by the product owner** |
| O2 | `mutate()`'s transaction path is unexercised end-to-end (`requireAuth()` throws 501). | Medium | Hard gate: **no route may call `mutate()` before T-08** |
| O3 | `app.workspace_id` is caller-supplied, not bound to the authenticated actor. | Medium | Hard requirement in **T-08** |
| O4 | A privileged operator can still suppress triggers via replica mode or owner DDL. | Low | Accepted residual; claims worded "append-only for all non-owner roles" |
| O5 | `toErrorEnvelope` logs a code-frame + stack for every >=500, including intentional 501s — internal only, but noisy and misleading in production logs. | Low | R3 (error sanitisation) |
| O6 | Readiness `db:"down"` is only reachable for a DB that fails *after* a successful boot (boot asserts privilege and throws first). | Low | Backlog |

---

**Verdict: R1 PASSES QA at `16ce851`** — three rounds of guardrail review (CRITICAL -> LOW), one QA
blocker found and fixed, both halves re-verified, and the provenance of each half stated in section 0
rather than blended together.
