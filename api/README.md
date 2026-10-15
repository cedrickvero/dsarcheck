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

`db:migrate` is `drizzle-kit migrate && node scripts/db-verify-invariants.mjs`.
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
