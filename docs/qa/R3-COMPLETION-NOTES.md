# R3 - Configuration and transport guards: COMPLETE

**Status: COMPLETE.** Both gates approved at `e45214f`.
Range: `96780c3..e45214f` (5 commits).

| Gate | Verdict | Risk | Rounds |
|---|---|---|---|
| privacy-security-guardrail | **APPROVE R3** | LOW | 3 (BLOCK, BLOCK-narrow, APPROVE) |
| qa-release-engineer | **R3 QA: PASS** | - | 17/17 checks |

## What R3 delivers (all verified, not asserted)

1. Security headers applied to every route from one definition; CSP nonce-free, no `unsafe-inline`, no `unsafe-eval`.
2. HSTS `max-age=63072000; includeSubDomains`, NO `preload`, production-only (absent in dev by design).
3. Cookie policy Secure / HttpOnly / SameSite=Lax / `__Host-` in production - defined, unused until T-08.
4. Request-ID treated as untrusted: only a UUID or `[A-Za-z0-9-]{8,64}` is echoed; every other shape is regenerated. CRLF is rejected at the transport layer.
5. Error responses sanitised; 4xx and 501 log nothing, so real incidents are readable.
6. **N-1 fixed**: an internal authorization failure is recorded as `authorization_unavailable`, not a policy refusal.
7. **N-2 fixed**: a failed audit write can no longer replace the refusal it was recording.
8. Production startup guards refuse development defaults for APP_DATABASE_URL, APP_DB_PASSWORD, DATABASE_URL (the ADMIN/superuser DSN), REDIS_URL, S3 credentials/bucket/endpoint, SMTP host/from/port/secure/ignoreTLS, APP_BASE_URL, SESSION_SECRET, DB_OWNER_USER, DB_POOL_MAX.
9. `ignoreTLS` cannot be enabled in production.
10. All 11 route stubs remain 501; R3 added no route, no migration, no table, no product feature.

## Evidence

`npm test` 162/162 (19 files) - typecheck 0 - `lint:boundary` 51 files, 0 violations -
`db:verify` 42/42 - `npm run build` exit 0 - `db:migrate` idempotent across 3 runs, 7 migrations
applied exactly once (hash == sha256 of each .sql) - live health routes 200 - 11 stubs 501 with the
envelope `{error:{code,message,requestId}}` - headers present live - HSTS absent in dev, present in prod.

**Log policy.** The single `Error` line in the whole test run is the sanitised N-2 summary:
`[audit-write-failed] Error cause_code=23503 constraint=audit_events_workspace_fk table=audit_events
message=redacted requestId=... refusal=InvalidObjectKeyError`. Grep found no SQL, no bound parameters,
no Postgres source files, no stack frames.

**Falsifiability.** QA demonstrated 6 discriminating cases (guard S3 key, runtime-vs-build exemption,
request-path 500, request-id echo regression, raw-object logger, safeMessage) - each assertion passes on
the real code and fails on a regressed input. This matters because this project has already shipped two
checks that could not fail.

## Why R3 took three review rounds

| Round | Verdict | Findings |
|---|---|---|
| 1 | BLOCK | **A** raw error objects logged at five sites (literal SQL, bound params, schema/table, pg source file, stack). **B** `DATABASE_URL` (superuser default) and `REDIS_URL` (unauthenticated) booted unguarded. **C** requirement 8's "missing cookie secret" was unimplementable - no such secret existed. |
| 2 | BLOCK (narrow) | The residual of **B**: `REDIS_URL`, `SMTP_HOST`, `SMTP_FROM` were guarded with `unset()` ONLY, so setting them TO their development default still booted production unguarded. |
| 3 | APPROVE | 25/25 behavioural probes; the full 24-variable schema enumerated (12 GUARDED / 2 NOT-A-DEFAULT / 10 BENIGN, each justified); no over-block. |

**Root cause of the recurrence, recorded because it is the reusable lesson.** The guard tests only ever
asserted the UNSET direction, so the value-at-default direction was invisible to the suite that was
supposed to catch exactly this. They now cover both directions for every guarded variable. The deeper
method failure was spot-fixing instances of a class three times; round 3 replaced that with a systematic
enumeration of every variable in the schema, which is what finally produced the statement that mattered:
**no unguarded security-relevant default**.

## Carried forward (none blocking)

- **L1 (LOW, hygiene)**: six variables (S3_BUCKET, S3_FORCE_PATH_STYLE, DB_OWNER_USER, DB_POOL_MAX, SMTP_PORT, SMTP_SECURE) are refused when unset but not when set to their development default. The defaults are benign; recorded for consistency, not as a defect.
- **L2 (LOW)**: loopback detection for DATABASE_URL/REDIS_URL does not catch exotic forms (authenticated localhost URLs, IPv6 `::1`, `0.0.0.0`, credential-less DSNs). Deliberate misconfigurations, not silent inheritance.
- **OBS-1 (non-blocking)**: the log summary includes `table=audit_events` alongside the permitted constraint name. App-internal, subsumed by the constraint name, no sensitive leak.
- **Dockerfile / compose entrypoint**: the container runs the API as `npm run dev` with `NODE_ENV=development`, so the R1 boot assertion and every R3 runtime guard are inert in the deployment as configured. Outside the write scope (infrastructure configuration). **Owner decision required.**
- **L1/L2 will be fixed in R4**, which needs its own guardrail review, rather than triggering a fourth R3 cycle.

## Accepted decisions

- Nonce-free CSP while no real page renders; per-response nonces when T-07 introduces rendering.
- HSTS omitted in development; a browser pinned to https over plain localhost is worse than no header.
- Nine orphaned audit rows retained (see `O1-AUDIT-RETENTION-DECISION.md`); no automatic purge is authorized.
