# DSAR API

Privacyspace - GDPR DSAR intake through to a closed case with evidence.

## Stack

Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS v4, Drizzle ORM on
PostgreSQL with row-level security, BullMQ/Redis for background jobs,
S3-compatible object storage, SMTP email.

## Run

```bash
npm install
npm run dev          # Next.js on :3000 (UI + API route handlers)
npm run dev:worker   # background worker (BullMQ) - a separate process
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
| `GET /health` | liveness - always `200 {"status":"ok"}` |
| `GET /health/ready` | readiness - `200` when Postgres answers, `503` when it does not |
| `GET /api/health` | same as `/health`, API-namespaced |
| `GET /api/health/ready` | same as `/health/ready`, API-namespaced |

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
  server/         server-only plumbing - never imported by client components
    http/         errors, route-handler wrapper, zod validation
    auth/         requireAuth
    tenancy/      workspace resolution
    health.ts     shared health logic
  db/             Drizzle client + schema (Postgres, RLS)
  domain/         pure logic - no I/O, unit-tested
  auth/           authz: can(user, action, resource)
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

The `server-only` package is deliberately **not** used: it throws outside Next's
server runtime, which would break both the BullMQ worker (run via tsx) and
vitest. The boundary is enforced by the check above instead.

## Database workflow

After changing src/db/schema.ts:

1. Run:
   npm run db:generate

2. Review the generated file in drizzle/migrations/.

3. Apply it with:
   npm run db:migrate

Never edit an already-applied migration. Create a new migration instead.

## Intended invariants

These are the target contract for the product (from AGENTS.md). They are the
design intent, not yet fully enforced - see Known follow-ups.

1. **Every sensitive action requires a reason** and writes an immutable audit
   event (actor, action, category, reason, object, timestamp, IP/session).
2. **No autonomous actions.** Nothing deletes data, closes a case, or sends a
   final response without an explicit human click.
3. **Tenant isolation** - `workspace_id` (and `org_id`) on every customer row,
   to be enforced by Postgres RLS rather than by application code alone.
4. **Role gates are enforced server-side.** UI disabling is a convenience only.
5. Every mutation is shaped `authz -> zod validate -> transaction(change + audit
   event)`, with the audit row committing in the same transaction as the change.
6. Audit tables are insert-only (trigger rejects UPDATE/DELETE).
7. Never write "guaranteed compliance", "automatic legal determination" or
   "AI-approved", and never imply legal advice.

## Known follow-ups

- **Invariants are claimed, not enforced.** `schema.ts` currently defines only
  `orgs` and `workspaces`; there are no RLS policies, no `audit_event` tables and
  no insert-only triggers, and every domain function plus `authz.can()` throws.
  Do not describe tenant isolation or audit immutability as "built" until this
  is done (tracked as T-04).
- **Migration 0001** adds `workspaces.org_id` as `NOT NULL` with no default -
  safe on an empty table, fails if `0000` was already applied with rows.
- **Domain functions are unported.** `src/domain/*` are typed stubs that throw.
  Port them from `design/reference/seed/workspace-seed.js` (tracked as T-07).
- Design tokens are not wired yet: `globals.css` holds neutral fallbacks only.
  Phase 0 brings in the real tokens from `docs/02-design-system.md`.
