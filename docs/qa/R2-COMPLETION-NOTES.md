# R2 — file/URL contract · completion notes

**Subject:** `c2c9a8c` (SSE hardening) on top of `cd49d64` (R2 implementation)
**Status:** ⏳ **provisional** — implementation accepted by the product owner; guardrail
review (`deleg_9267ac0c`) and QA verification are outstanding. R2 is not complete until
both approve, and R3 must not start before then.

## What R2 delivers

- **Key scheme** `ws/<workspaceId>/<purpose>/<uuid>`. Workspace is the actor's
  database-derived one, never a caller claim; purpose comes from a server-side allowlist;
  the uuid is server-generated. A DB CHECK requires `object_key` to begin with
  `ws/<workspace_id>/`, so a cross-tenant row cannot be stored.
- **`objects` table** — RLS enabled *and forced*, tenant policy on `app.workspace_id`
  failing closed, org/workspace FKs, unique `object_key`, purpose allowlist CHECK,
  content-type shape CHECK.
- **One minting path** — `src/server/storage/signedUrl.ts`, in fixed order:
  authorize → validate purpose → validate/build key → clamp TTL → apply SSE → mint URL
  → persist metadata + audit event in ONE transaction. On denial: no URL, no row, and the
  denial is audited.
- **TTL ceilings** 900s upload / 600s download, always clamped, never trusted. Exceeding
  a ceiling requires a named, configured exception matching one purpose+operation; the
  exception name is written into the audit event. No wildcard.
- **SSE** — `AES256` default; `aws:kms` selectable via `S3_SSE_ALGORITHM`. Selecting
  `aws:kms` without `S3_KMS_KEY_ID` **fails at startup**. Callers cannot influence
  encryption (the builder takes only a key and a content type, and the SSE headers are
  signed). The applied algorithm and a key *reference* are audited; key material never is.
- **`src/lib/s3.ts` deleted** — the old `signedGetUrl`/`signedPutUrl` helpers (unbounded
  caller TTL, no tenant scoping, logging left to callers) are gone and referenced nowhere.

## Evidence

| Gate | Result |
|---|---|
| `npm run db:migrate` | exit 0 — migrations applied 5, **38/38 invariants** |
| `npm test` | **91 passed**, 11 files |
| `npm run typecheck` | exit 0 |
| `npm run lint:boundary` | 48 files, 0 client→server, 0 privileged-handle |
| `npm run db:verify` | **38/38 invariants hold** |
| `npm run db:verify -- --self-test` | all 8 R2 object checks correctly failed against a deliberately broken table |

## Verification-infrastructure defects found during execution

**All seven were defects in the verification code, not in the product.** They are recorded
separately so they are not misread as product vulnerabilities — and because the pattern
they share is the point.

1. `db-verify-invariants.mjs` called `checkObjectsTable(c, …)` — the client in that script
   is named `admin`. The call site had never been exercised because only `--self-test` was
   run during the proposal review, not the full verification. Caught by `db:migrate`.
2. The same file then called `ok()` / `bad()` — that verifier exposes a single recorder,
   `check(cond, name, detail)`.
3. `tests/server-boundary.test.ts` still imported the *deleted* `@/lib/s3`, so the fixture
   no longer violated the rule and the test failed for the wrong reason.
4. `tests/objects-schema.test.ts` FK case asserted a foreign-key violation, but the org
   subquery returned NULL under the ghost tenant, so RLS rejected the row first. The test
   now passes a real org id so the FK is the only possible violation.
5. The same suite's isolation case rolled back its own setup insert, then read zero rows —
   **the identical trap an earlier QA run hit and misdiagnosed as a product failure.**
   Setup writes now commit deliberately.
6. Fixed `requestId`s in `storage-signed-url.test.ts` meant a rerun read its own previous
   run's append-only audit rows as duplicates. Now unique per run.
7. `objects` was verified twice (the shared table loop *and* the R2 checker), printing every
   result twice. Deduped; invariant count 41 → 38.

**The lesson, which is the reason this list is being kept:** a security check must be proven
capable of failing, not merely present. This project has now been bitten three times by a
check that could not fail — the vacuous boundary check, the `assertLeastPrivilege()` that
was dead code, and defect #1 above, where a verification call site had never once run.
`db:verify --self-test` exists so the gate itself is falsifiable.

## Accepted, not defects

- `size_bytes` stays NULL until the upload-completion slice.
- `recordFileAccess()` has no caller: all 11 routes remain 501 until T-08.
- `case_id` / `task_id` omitted until the migration that creates `dsar_requests` / `tasks`.
- `uploader_actor_id` has no FK: no actors table exists until T-08.
- Download audit events record `sse: null`: a presigned GET carries no encryption
  parameters; an object's SSE is set at upload.
- An owner DDL / replica-mode residual still applies to the append-only guarantee (O4 in
  the R1 verdict).

## Outstanding

- Guardrail review of R2 — `deleg_9267ac0c`, in flight; HIGH/CRITICAL findings to be
  cross-checked before being relayed.
- QA: `db:migrate` idempotency, `npm test`, `typecheck`, `lint:boundary`, `db:verify`, and
  confirmation that migration 0004 remains applied exactly once.

---

## Guardrail findings and their fixes — all PRODUCT defects

The R2 guardrail review (`deleg_9267ac0c`) returned **APPROVE R2, risk MEDIUM** with eight
findings, and required changes before T-08 wiring. All were fixed rather than documented.

| Finding | Sev | Fix |
|---|---|---|
| **F-1** `objects` was deletable by the application principal — silently, with no audit row | MEDIUM | migrations `0005` + `0006` revoke DELETE from **both** roles; `db-ensure-runtime-role.mjs` no longer re-grants it; asserted by db:verify per-table **and** globally |
| **F-2** only `AuthorizationDeniedError` was audited — a cross-tenant key, a key/purpose mismatch and an unknown purpose each produced **0** audit rows | MEDIUM | every denial path writes a denial row carrying a `denialCode` |
| **F-3** `object_id` meant different things on upload vs download events | MEDIUM | `object_id` is the key's uuid on both; the row id moved to `meta.objectRowId` |
| **F-4** no upper bound on a TTL exception (3600 = 4x the ceiling; 700000 = SigV4 failure at mint, not startup) | MEDIUM-LOW | `EXCEPTION_TTL_HARD_CAP = 3600`, enforced when the config is parsed **and at STARTUP** via the env schema |
| **F-5** the exception branch skipped the positive-TTL rule (0 → an already-expired URL persisted and audited as success) | LOW | the exception branch applies the same positive/non-finite check as `clampTtl` |
| **F-6** an invalid reason made the denial's own audit write throw, masking the denial | LOW | the reason is validated before any work begins |
| **F-7 / F-8** db:verify lacked the objects fail-closed read and a withheld-DELETE assertion | NOTE | both added; the self-test proves them able to fail |

### F-1's real root cause — worth remembering

Revoking the privilege in a migration was **not enough**, for two reasons that only a live
probe reveals:

1. `db-ensure-runtime-role.mjs` runs **after** migrations in the `db:migrate` chain and
   re-granted `delete on all tables`, silently undoing the revocation on **every** migrate.
2. `app_runtime` is a **MEMBER of `app_tenant`**, so it *inherited* that role's blanket
   DELETE — revoking from the member alone changed nothing.

The new db:verify invariant caught both within seconds of being written, which is the
whole point of proving a check can fail: `has_table_privilege('app_runtime','objects','DELETE')`
stayed `true` until the second migration, and the gate said so.

---

## FINAL STATUS: R2 COMPLETE — both gates approved

| Gate | Verdict | Risk | Rounds |
|---|---|---|---|
| Privacy & security guardrail | **APPROVE R2 HARDENING** | **LOW** | 3 (c2c9a8c -> 0146aa1 -> f89b184 -> c21c2d7) |
| QA & release | **R2 QA: PASS** | — | 3 |

### Commit chain

```
c21c2d7  fix(r2): denial-code fidelity + close the guardrail NF findings
f89b184  fix(r2): audit every refusal path (closes the F-2 blocker)
0146aa1  fix(r2): close all eight guardrail findings
8d3bad7  docs(qa): record the eight guardrail findings and their fixes
c2c9a8c  feat(r2): file/URL contract + objects table (the reviewed commit)
cd49d64  feat(r2): apply the approved R2 patch
```

### Final evidence (both gates, independently produced)

```
42/42 db:verify invariants     113 tests / 13 files       typecheck 0
boundary 48 files, 0 violations                           build OK
self-test: all 11 R2 object checks fail on a broken table
db:migrate idempotent x2 (identical output, 42/42 both runs)
no table in schema public is deletable by app_runtime or app_tenant
migration counts: 7 rows = 7 disk files (0000-0006) = 7 journal entries
```

### What the audit trail can now reconstruct

The denial taxonomy was rebuilt across three rounds, driven by two gates catching
different facets of the same defect. An auditor can now distinguish, **without parsing
free text**:

| Event | `denialCode` | Discriminator |
|---|---|---|
| tenant-boundary probe (cross-tenant key) | `invalid_object_key` | `object_id` **NOT NULL** |
| malformed request key | `invalid_object_key` | `object_id` NULL |
| purpose mix-up | `purpose_key_mismatch` | — |
| TTL policy refusal | `invalid_ttl` / `invalid_ttl_exception` | exception named? |
| unusable reason | `invalid_reason` | — |
| unknown purpose | `unknown_purpose` | — |
| permission-layer denial | `authorization_denied` | — |

That the first two rows are distinguishable at all is the direct product of NF-1 and
NF-2 both being fixed — QA caught NF-1 as a blocker while the guardrail rated it LOW,
and the guardrail's NF-2 supplied the discriminator that makes NF-1's fix verifiable.

### Two qualifications carried forward (guardrail's own, judged NOT delta-introduced)

Both are **pre-existing and non-blocking** (`new_findings: []`), and both are audit-trail
fidelity issues of the kind this prerequisite exists to eliminate, so they are carried
into **R3 (config & transport guards)**, whose remit already covers error handling:

- **N-1** — the denialCode triage in `signedUrl.ts` falls through to `invalid_purpose`
  for ANY error that is not `AuthorizationDeniedError`/`UnknownPurposeError`, so an
  internal outage (e.g. a permission store throwing) is audited as a *purpose-policy
  refusal*. Byte-identical at f89b184 and HEAD; not delta-introduced.
- **N-2** — if the actor's workspace/org row does not exist, the denial INSERT fails
  `audit_events_workspace_fk`, and that write error **masks the original refusal** and
  lands zero rows. Structural and identical for every denial path; unreachable for a
  DB-derived actor, but the masking behaviour is wrong regardless.

Also carried into R3 from earlier rounds: **O5** (`toErrorEnvelope` logs a code-frame and
stack for every >=500 including intentional 501s) and the **insecure in-code S3
credential defaults** that would boot in production.
