# DSAR API

Privacyspace — GDPR DSAR intake through to a closed case with evidence.

## Stack

Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS v4, Drizzle ORM on
PostgreSQL with row-level security, BullMQ/Redis for background jobs,
S3-compatible object storage, SMTP email.

## Run

```bash
npm install
npm run dev          # Next.js on :3000 (UI + API route handlers)
npm run dev:worker   # background worker (BullMQ) — a separate process
npm run typecheck
npm test
npm run build
npm run start
```

Under Docker Compose the api / worker / migrate services run from this
directory. The worker is intentionally a separate process: Next.js has no
concept of background jobs.

## Health

Both surfaces share one implementation (`src/server/health.ts`) so they cannot
drift apart.

| Route | Meaning |
|---|---|
| `GET /health` | liveness — always `200 {"status":"ok"}` |
| `GET /health/ready` | readiness — `200` when Postgres answers, `503` when it does not |
| `GET /api/health` | same as `/health`, API-namespaced |
| `/api/health/ready` | same as `/health/ready`, API-namespaced |

Every JSON error uses one envelope:
`{"error":{"code","message","requestId"}}`. The `x-request-id` header is echoed
on every response.

## Layout

```
src/
  app/            Next.js App Router
    page.tsx      placeholder home (real screens come from docs/03-screens.md)
    health/       root-level health routes
    api/          route handlers, one folder per product surface
  server/         server-only plumbing — never imported by client components
    http/         errors, route-handler wrapper, zod validation
    db/           mutate(): the only sanctioned write path
    auth/         requireAuth
    tenancy/      workspace resolution
    health.ts     shared health logic
  db/             Drizzle client + schema (Postgres, RLS)
  domain/         pure logic — no I/O, unit-tested
  auth/           authz: can(actor, action, resource)
  jobs/           BullMQ queues + worker bootstrap
  lib/            s3 (signed URLs), mailer, ids
tests/
```

Every route below `/health` is an intentional stub returning `501` with the
standard error envelope, so nothing fails silently.

## Server boundary

Database, authorization, audit, queue, storage and email logic lives outside
`src/app/**` and must never be imported into a client component:

```bash
npm run lint:boundary
```

The check resolves both the `@/` alias and relative paths, and catches static,
dynamic (`import()`) and `require()` forms. **It has positive controls**:
`tests/server-boundary.test.ts` runs it against fixtures that violate the rule
and asserts a non-zero exit, so a passing run is meaningful rather than vacuous.

The `server-only` package is deliberately **not** used: it throws outside Next's
server runtime, which would break both the BullMQ worker (run via tsx) and
vitest. The boundary is enforced by the check above instead.

## Database workflow

After changing `src/db/schema.ts`:

1. `npm run db:generate` — write a new migration.
2. Review the generated file in `drizzle/migrations/`.
3. `npm run db:migrate` — apply it **and** verify the invariants below.

Never edit an already-applied migration. Create a new migration instead.

`db:migrate` is `drizzle-kit migrate && node scripts/db-ensure-runtime-role.mjs && node scripts/db-verify-invariants.mjs`.
The verifier asserts 22 security invariants against the live database and exits
non-zero on drift, so a database cannot silently fall out of compliance.
`npm run db:verify` runs the assertions alone.

## Non-negotiables

The same ten rules as `AGENTS.md`, with their **actual** enforcement status —
never describe a rule as "built" when it is only intended.

| # | Rule | Status |
|---|---|---|
| 1 | Every sensitive action requires a reason and writes an immutable audit event | **Partial** — `audit_events` is append-only (UPDATE/DELETE/TRUNCATE rejected), `mutate()` requires a reason and writes the event in the same transaction; no route uses `mutate()` yet |
| 2 | No autonomous actions | **Enforced by absence** — no code path deletes, closes or sends anything; all 11 product routes return `501` |
| 3 | Tenant isolation via `workspace_id`/`org_id` + Postgres RLS, not app code alone | **Enforced** — RLS enabled *and forced* on `audit_events`, `orgs`, `workspaces`; policies key on `app.workspace_id` and fail closed; the app **logs in** as `app_runtime` (NOBYPASSRLS, non-owner, no DDL or TRUNCATE), asserted at boot and by `db:verify`; 9 isolation tests |
| 4 | Privacyspace staff never see case contents without a customer-approved, time-limited grant | **Not enforced** — no grant mechanism exists yet (T-08) |
| 5 | Role gates enforced server-side | **Not enforced** — `requireAuth()` and `can()` throw `501`; they fail loudly rather than silently (T-08) |
| 6 | SLA always visible on case lists and the case header | N/A — no UI yet |
| 7 | Status is never colour-only (icon + label + colour) | N/A — no UI yet |
| 8 | Reuse prototype copy verbatim; never "guaranteed compliance", "automatic legal determination", "AI-approved" | **Enforced by review** — no prohibited wording anywhere in the repo; keep the legal disclaimer in the workspace sidebar |
| 9 | Accessibility: 44px targets, teal focus ring, Escape closes dialogs, focus trapped/restored, `prefers-reduced-motion` | N/A — no UI yet |
| 10 | Dates `13 Oct 2026` / `13 Oct 2026, 10:42` (24h); store UTC, display in workspace timezone | N/A — no UI yet |

Mutation shape (supports rules 1, 3 and 5): every write goes
`authz → zod validate → one transaction(change + audit event)`. The audit row
commits or rolls back with the change — proven both ways in
`tests/tenant-isolation.test.ts`.

## Object storage (R2)

Files are never publicly reachable. Access is always a short-lived signed URL, and
every issue and every access attempt is recorded in `audit_events`.

**Key scheme** — `ws/<workspaceId>/<purpose>/<uuid>`

- `workspaceId` is the actor's database-derived workspace, never a caller claim
- `purpose` comes from the server-side allowlist in `src/server/storage/purpose.ts`
- the `uuid` is generated server-side
- a DB CHECK requires `object_key` to begin with `ws/<workspace_id>/`, so a row whose
  key belongs to another tenant cannot be stored at all

**One entry point.** `src/server/storage/signedUrl.ts` is the only place a URL is
minted, in a fixed order:

```
authorize -> validate purpose -> validate/build key -> clamp TTL
  -> apply SSE -> mint URL -> persist metadata + audit event in ONE transaction
```

If authorization fails there is no URL, no row, and the denial is itself audited.
The legacy `signedGetUrl`/`signedPutUrl` helpers in `src/lib/s3.ts` (unbounded
caller-supplied TTL, no tenant scoping) are deleted, so no unscoped minting path remains.

**TTL ceilings** — uploads 900s, downloads 600s. A requested TTL is a hint and is
always clamped. To exceed a ceiling you must configure a named exception
(`SIGNED_URL_TTL_EXCEPTIONS`) that matches one purpose and one operation exactly; the
exception's name is written into the audit event. There is no wildcard.

**Encryption** — uploads carry server-side encryption. `AES256` (SSE-S3) is the default
so local MinIO needs no KMS; `S3_SSE_ALGORITHM=aws:kms` selects KMS for production and
requires `S3_KMS_KEY_ID` — if the algorithm is `aws:kms` and no key is set, the process
**fails at startup**, not on the first upload.

Callers cannot influence encryption: the command builder accepts only an object key and
a content type, and the algorithm comes from configuration alone. Because the SSE headers
are part of the signature, an uploader using the presigned PUT must send the matching
`x-amz-server-side-encryption` header — substituting its own value breaks the signature.
The selected algorithm and a reference to the key are recorded in the audit event; key
material never is. (A presigned GET carries no encryption parameters — an object's SSE is
a property of the object, set at upload, so download events record `sse: null`.)

**Not yet wired:** the 11 route stubs remain 501. Authorization is an injectable seam
(`src/server/auth/authorize.ts`) because the permission source arrives with T-08; until
then no route may call the storage layer.

## Config & transport guards (R3)

**CSP decision, stated explicitly** — this ships a **nonce-free** policy, which is only
acceptable while the app needs **no inline script and no inline style**. Tailwind compiles
to static CSS, so neither is required today. If a future slice needs inline script, the
answer is **per-response nonces** (which means adding middleware), *not* re-opening
`'unsafe-inline'`. Revisit this decision at T-07 when routes begin to render.

**Security headers** — one definition in `src/server/http/security-headers.ts`, applied
to every route from `next.config.ts`. The CSP is deliberately **nonce-free** (option 1):
Tailwind compiles to static CSS so no inline styles are needed, and a nonce-based policy
needs per-request middleware that only becomes meaningful once routes actually render
(T-07+). `script-src 'self'` with no `unsafe-inline`/`unsafe-eval` already blocks injected
inline script. **HSTS is production-only** (sending it over plain-http localhost would pin
the developer's whole machine to https) and `preload` is withheld until the production
domain list exists, because preload submission is effectively irreversible.

**Cookies** — `src/server/http/cookies.ts` defines the attribute policy. Nothing calls it
yet: authentication arrives in T-08. It exists so that when a session cookie IS introduced
the secure flags are the only available shape. Production uses the `__Host-` prefix, which
browsers reject unless the cookie is Secure, has no Domain, and is Path=/.

**Request ids** — an inbound `x-request-id` is treated as untrusted input and accepted
only if it is a UUID or a short boring token (`[A-Za-z0-9._-]{8,64}`). Anything else is
discarded and a fresh id generated, rather than sanitised in place. These values are
echoed into a response header and into every log line for the request, so reflecting
caller bytes would be a log-injection surface.

**Error envelope** — only errors we authored may surface their message; anything
unrecognised becomes `Internal server error` with code `internal_error`, so a driver
error, SQL fragment or stack cannot reach the client. Authored messages are stripped of
control characters and capped. **Logging policy:** 4xx and intentional 501 stubs log
nothing (logging a stack for every 501 made real incidents unreadable), an authored 5xx
logs with its stack, and an unexpected failure always logs.

**Production config guard** — `src/env.ts` refuses to start in production when any of these
still hold a development default: `APP_DATABASE_URL` (a dev host with a placeholder
password), `APP_DB_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, or a non-https
`APP_BASE_URL` (which would break Secure cookies and redirects). It is a **runtime** guard:
`next build` also runs with `NODE_ENV=production` and a build stage has no secrets, so the
build phase is exempt — otherwise every production build fails.

**That exemption is not a bypass.** `NEXT_PHASE` is an ordinary *mutable* environment
variable, and setting it before `env.ts` is first imported skips the import-time check
(this was verified reachable). `assertProductionConfig()` therefore exists as a second
entry point with **no exemption at all**, called from the instrumentation hook at boot: the
server refuses to *serve* regardless of how its environment was assembled. A regression
test asserts that `NEXT_PHASE=phase-production-build` + development defaults still gets
refused at runtime.

**Values that must be chosen deliberately** — production also refuses to start when any of
these is left unset, because each carries a development default that would otherwise apply
silently: `S3_BUCKET` (a dev bucket name), `S3_FORCE_PATH_STYLE`, `DB_OWNER_USER` (the owner
role the least-privilege assertion checks against), `DB_POOL_MAX`, and `SMTP_PORT` +
`SMTP_SECURE`. The mailer's TLS mode is validated against its port — 465 demands
`SMTP_SECURE=true`, every other port demands `false` with STARTTLS — so a mismatch cannot
silently downgrade transport.

**Known framework gap (accepted, recordable)** — Next's own trailing-slash 308 redirect is
generated by the framework before the app's header rules apply, so that one response carries
no security headers. It is not an app route and not reachable by normal browser navigation.
Closing it would require middleware, which is the same addition the nonce-CSP would need.

**Audit fidelity (carried from R2's guardrail)** — an internal failure to *decide* is now
recorded as `authorization_unavailable`, not as a purpose-policy refusal (N-1), and a
failed audit write can no longer **replace the refusal it was recording** (N-2): the
original error always surfaces, and the missing row is logged, because a refusal that could
not be recorded is itself an incident.

## Known follow-ups

- **Authentication is not implemented.** `requireAuth()` and `can()` throw `501`,
  so `mutate()` cannot yet succeed end-to-end and `app.workspace_id` is still
  caller-supplied rather than bound to an authenticated actor (T-08).
- **`mutate()`'s transaction path is unexercised.** The atomicity tests drive
  `withTenant()` directly; an injectable actor seam is needed to test the
  authorisation → validation → transaction path itself.
- **Migration 0001** adds `workspaces.org_id` as `NOT NULL` with no default —
  safe on an empty table, fails if `0000` was already applied with rows.
- **Append-only is not absolute.** UPDATE, DELETE and TRUNCATE are blocked for
  every non-owner role, but a privileged operator can still
  `SET session_replication_role = replica` or `DISABLE TRIGGER`. Treat those as
  operator-only actions requiring their own audit trail.
- **9 historical audit rows reference a workspace that no longer exists** — created by an
  earlier test cleanup, before the tenant-integrity FKs existed. `db:verify` reports them
  and they are deliberately **not** deleted (append-only forbids it). Because the FKs are
  `NOT VALID`, that history is unenforced; a retention decision is still owed.
- **Migration 0003's header comment is stale.** It still describes `app_runtime` as
  `NOLOGIN` and says connections assume it with SET ROLE. The authoritative
  definition is now `scripts/db-ensure-runtime-role.mjs`, which alters the role to
  `LOGIN`. The migration file is left byte-identical because it has already been
  applied, and editing applied migrations is forbidden (see Database workflow).
- **Domain functions are unported.** `src/domain/*` are typed stubs that throw.
  Port them from `design/reference/seed/workspace-seed.js` (T-07).
- Design tokens are not wired yet: `globals.css` holds neutral fallbacks only.
  Phase 0 brings in the real tokens from `docs/02-design-system.md`.

## Verification

```bash
npm run typecheck        # tsc --noEmit
npm test                 # unit + DB isolation suites
npm run lint:boundary    # no client -> server imports
npm run db:verify        # 22 security invariants against the live database
```
