# DSARify / Privacyspace - project status

A consolidated report. Per-prerequisite detail lives in the sibling completion notes;
raw gate evidence is under `/opt/data/qa-tmp/`.

## Position

**M0 Foundation (R1-R4) is complete and gate-approved. T-08 (authentication,
sessions, RBAC, authorization seam) is built but NOT verified.**

| Prerequisite | Verdict | Commit |
|---|---|---|
| R1 tenant/audit substrate, least privilege | guardrail APPROVED (LOW, 3 rounds) + QA PASSES | `16ce851` |
| R2 file/URL contract | guardrail APPROVE R2 HARDENING (LOW, 3 rounds) + QA PASS | `c21c2d7` |
| R3 config & transport guards | guardrail APPROVE R3 (LOW, 3 rounds) + QA PASS | `e45214f` |
| R4 human-gated erasure contract | guardrail APPROVE R4 + QA PASS | `984a071` |
| T-08 auth substrate | **WIP - gates not dispatched** | `52ea408` |

Every prerequisite was accepted only on guardrail APPROVE **and** QA PASS together,
with no HIGH or CRITICAL finding open.

## What the foundation guarantees

Each property is enforced in a mechanism, not a convention - and each is backed by a
check that has been proven able to fail.

| Property | How it is enforced |
|---|---|
| Tenant isolation | Postgres RLS enabled **and forced** on every table; the app logs in as `app_runtime` (NOBYPASSRLS, non-owner); the tenant GUC is set per transaction and fails **closed** |
| Least privilege | DELETE and TRUNCATE withheld from both app roles; a global invariant asserts it; the app cannot suppress triggers via `session_replication_role` |
| Immutable audit | `audit_events` is insert-only (a trigger rejects UPDATE/DELETE); one writer, one insert path |
| File access | Scoped, expiring signed URLs only; TTL ceilings clamped; SSE configured server-side and never caller-overridable; every refusal audited with its own denial code |
| Transport & config | Security headers + CSP; HSTS production-only, no preload; cookies `Secure`/`HttpOnly`/`SameSite=Lax` with `__Host-` in production; a production guard that refuses development defaults |
| Logs | One sanitised logging helper; no raw error object can reach any log (verified by grep for SQL, bound parameters, driver internals, source file names and stack frames) |
| No autonomous destruction | No delete/purge/suppress path exists anywhere; erasure decisions require a named human, a reason, and an audit event in the same transaction |

## Verification state

```
211 tests / 23 files  ·  typecheck 0  ·  boundary 67 files, 0 violations
db:verify 42/42 invariants  ·  8 migrations, applied exactly once each
11 domain routes still 501  ·  dev boots; /health and /health/ready 200
```

Two practices matter more than the numbers:

- **Falsifiability is demonstrated, not asserted.** R3's QA killed 6 discriminating
  cases; R4's QA ran **mutation testing** (6/6 mutations killed across six assertion
  families) against a scratch copy with the repo byte-verified untouched. This project
  has already shipped two checks that could not fail; that is now a review item.
- **Partial evidence is never accepted.** Twice, a delegation completed without
  delivering its result, and one of those had found a release blocker that a
  partial-evidence verdict then missed. Every review now writes its findings
  incrementally to its own file, and each review keeps its own evidence chain.

## T-08 - built, unverified

Migration `0007` adds `users`, `sessions`, `magic_links`, `mfa_totp` and
`rate_limit_hits`: RLS enabled and forced, tenant policies on all five,
least-privilege grants with no DELETE, and `cleanup_rate_limit_hits()` as a
`SECURITY DEFINER` function so rate-limit rows can expire without weakening the
no-delete invariant. Two token tables carry an additional hash-keyed pre-auth lookup
policy, because sign-in must read the row that reveals its own tenant, and elevating
the app role for that would give every query sign-in's reach.

Modules: `crypto`, `session-store`, `magic-link`, `totp`, `rate-limit`, `require-auth`
(the 501 stub is gone), `server/authz.ts` (the real `can()` transcribed from
`docs/01`), `tenancy`. Routes: exactly the five approved. `src/auth/authz.ts` no longer
throws 501 either.

**Not done: the seven auth test suites.** Without them a reviewer could only read
source for compliance, so the gates were deliberately NOT dispatched and no verdict has
been claimed.

### Two decisions outstanding

1. **TOTP secret at enrolment.** The brief says the secret is never returned in API
   responses; enrolment cannot work unless it is shown once. Current behaviour returns
   an `otpauth://` URI **once**, never afterwards, never logged, never audited - flagged
   in code for the guardrail to confirm or overrule.
2. **The Role rename is a breaking change to approved code.**
   `owner|admin|handler|approver|viewer` became
   `owner|approver|workspace_admin|request_handler|system_owner` in `require-auth.ts`,
   which R4's gate and several tests referenced. One R1 assertion changed with it: it
   asserted `/not implemented/i`, and auth no longer being 501 is the point of T-08.

## Open items

| Item | Status |
|---|---|
| Retention-review slice (six-state proposal machine) | Deferred out of T-08 by owner decision; needs its own ticket, and its execution side must stay human-gated |
| Pre-launch retention/archival policy (O1) | Required before production; itself human-approved and audited |
| Dockerfile/compose entrypoint | The container runs `npm run dev`, so the production guard and HSTS stay inert as configured. Outside the agent's write scope; owner's call |
| Nine orphaned audit rows (O1) | Retained by owner decision; they self-identify as test data |
| Next.js trailing-slash 308 | Carries no security headers; same-origin redirect serving no body; deliberate deferral to the middleware slice |
| Nonce-based CSP | Deferred to T-07, when real pages render |

## How work is gated

Each slice is implemented, then reviewed by two independent roles whose verdicts are
required together: `privacy-security-guardrail` (runs on a stronger model, pinned per
role) and `qa-release-engineer`. Both write findings to their own file as they go.
Dissent between them is treated as signal, not noise: on R2 the same defect was rated a
blocker by QA and LOW by the guardrail, and the stricter reading was correct.
