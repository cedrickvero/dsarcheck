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
