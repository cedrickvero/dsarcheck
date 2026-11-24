# DSARify / Privacyspace - project status

A consolidated report. Per-prerequisite detail lives in the sibling completion notes;
raw gate evidence is under `/opt/data/qa-tmp/`.

> **Read `git log` before trusting this file.** It has already drifted once: it claimed
> T-08 was unverified for several commits after both gates had approved it (`2dfd1a3`,
> recorded in `c43001e`). The log and the per-slice notes are authoritative; this page is
> a summary of them.

## Position

**M0 Foundation (R1-R4) complete and gate-approved. T-08 (authentication, sessions, RBAC,
authorization seam) complete and gate-approved. The domain layer (build plan Phase 1) is
ported and tested, with its gates NOT yet dispatched. T-07 (workspace shell, case list,
dashboard) is partial.**

| Prerequisite | Verdict | Commit |
|---|---|---|
| R1 tenant/audit substrate, least privilege | guardrail APPROVED (LOW, 3 rounds) + QA PASSES | `16ce851` |
| R2 file/URL contract | guardrail APPROVE R2 HARDENING (LOW, 3 rounds) + QA PASS | `c21c2d7` |
| R3 config & transport guards | guardrail APPROVE R3 (LOW, 3 rounds) + QA PASS | `e45214f` |
| R4 human-gated erasure contract | guardrail APPROVE R4 + QA PASS | `984a071` |
| T-08 auth substrate | guardrail **APPROVE T-08** + QA **PASS** (18/18 gate items) | `2dfd1a3` |
| Domain port (Phase 1) | implemented, 85 tests, mutation-checked; **gates not dispatched** | `2eba546` |
| T-07 workspace shell + case list | **partial** - shell and cases foundation only | `df0e8ab` |

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
| Domain derivations | SLA, progress/stepper, pre-closure checks, response text, CTA, subdomain rules and notification derivation are pure functions in `src/domain/**`, ported from the design handoff and covered branch by branch |

## Verification state

Measured at `ce1a728`:

```
649 tests / 43 files    539 passed · 18 failed · 43 skipped · 5 files skipped
typecheck               0 errors
boundary                85 files, 0 client -> server imports, 0 privileged handles
11 domain routes        still stubbed (notImplemented -> 501)
```

The 18 failures are **environmental, not regressions**: the auth, cases, audit-fidelity
and erasure-decision suites need `DATABASE_URL`, and the shell they ran in had none. They
fail loudly on purpose ("database unavailable, asserted nothing") rather than skipping
green - which is the right design, and means the number is honest rather than flattering.

A partial environment was measured once: with the admin DSN from `api/.env.example` the
total rose to 581 passed / 59 failed, and **40 of those failures were one cause** -
`password authentication failed for user "app_runtime"`, the least-privilege role every
tenant-scoped query uses. Its password in the running container is not the sample value,
so the app-role suites cannot run until the real `APP_DATABASE_URL` is supplied. Run them
where the environment already exists:

```
docker exec hermes_dsar_api npm test
```

Two practices matter more than the numbers:

- **Falsifiability is demonstrated, not asserted.** R3's QA killed 6 discriminating
  cases; R4's QA ran **mutation testing** (6/6 mutations killed across six assertion
  families) against a scratch copy with the repo byte-verified untouched. This project
  has now shipped four checks that could not fail; that is a standing review item.
- **Partial evidence is never accepted.** Twice, a delegation completed without
  delivering its result, and one of those had found a release blocker that a
  partial-evidence verdict then missed. Every review now writes its findings
  incrementally to its own file, and each review keeps its own evidence chain.

## Domain port (Phase 1) - implemented, ungated

`src/domain/**` was entirely stubs that threw `not implemented`, and nothing in `src/` or
`tests/` imported the folder. The case list and header therefore had no SLA, no progress
and no checks, and non-negotiable 6 ("SLA is always visible") could not be met by any
wiring.

Ported verbatim, copy strings included: `sla()`, `progress()`, `steps()`, `checks()`,
`respText()`, `primaryCta()`, `checkSub()`, `deriveNotifications()`, plus the docs/04 types
and a `dates.ts` for UTC arithmetic and the three display formats.

85 tests across 7 files. Three mutations were run and killed: an off-by-one on overdue
days, a redaction gate that ignores "no files need redaction", and a `<= 5` deadline
window narrowed to `<= 4`. **The third survived the first pass** - no test sat on the
exact five-day boundary - and a boundary test was added before it died. Two subtleties
the tests now pin down:

- For an **erasure** case, `Action required` is deliberately *not* counted as an "open"
  system: the erasure work check reports it, so the two checks cannot double-count.
- Stepper done-states are independent of position, as in the prototype: a case can have
  its checklist complete while identity is still pending.

**Parity is now proven, not claimed.** `tests/domain-parity.test.ts` loads the original
`design/reference/seed/workspace-seed.js` in-process and runs its `sla()`, `progress()`,
`checks()` and `respText()` over every case it seeds plus eleven synthetic cases, requiring
our output to match field for field (275 assertions). A mutation that narrowed a copy
string from 7 to 14 days killed 64 of them. Two findings came out of writing it:

- The seeded demo data does not reach every branch - every seeded Completed system has
  evidence and no seeded case lacks a template. The synthetic cases close that gap; a
  mutation on the "N systems missing evidence" detail survived until they existed.
- The reference omits `deadlineS` on closed cases; ours always returns a string so the UI
  cannot render `undefined`. That divergence is asserted deliberately rather than papered
  over.

## T-08 - complete (see `T08-COMPLETION-NOTES.md`)

Both gates approved at `2dfd1a3`, after the first review **BLOCKED** `ed938e4` over two
CRITICALs that a green 241-test suite had not caught: redemption was impossible (a
`FOR SELECT`-only token policy meant every valid link returned 401) and MFA was a
deadlock (both TOTP routes called `requireAuth` first).

Carry-forwards, all still open:

1. A future role-change route must call `rotateOnPrivilegeChange` **and** write the
   privilege-change audit event in ONE transaction. No route drives it today.
2. `tests/auth-magic-link.test.ts` passes unchanged under mutation - its single-use claim
   has no teeth. Harden it or fold it into the mfa-step suite.
3. `users.mfa_required` is a dead column; role policy in `authz.ts` is the live source.
4. The ambiguous-email guard compares the raw `email` rather than the normalised hash
   (fails closed; case-sensitivity edge).
5. A recorded test nit from the guardrail.
6. Multi-workspace sign-in is refused rather than disambiguated - fail-closed, but it
   needs a workspace-selection step before any customer has two.

## T-07 - partial

Built: the `src/app/app/layout.tsx` shell, `cases/page.tsx`, `cases/[caseId]/page.tsx`,
`case-table.tsx`, `case-header.tsx`, `state-panel.tsx`, loading/error/not-found states,
CSP nonce, and migrations `0009`/`0010`. `df0e8ab` repaired a rendering suite that had
never run and widened the boundary rule, which had only caught named imports.

Not built, against Phase 3 of the build plan: saved views, search, type/status filters,
bulk select with Assign owner and CSV export, the notification bell and popover, skeleton
rows, empty states, sorting by days left, and the dashboard KPIs. `listCases()` is a bare
`select * ... order by received_at desc`; the spec sorts by days left.

The domain port now supplies what those need; no wiring exists yet, and the slice cannot
be verified end to end until the DB suites run.

## Open items

| Item | Status |
|---|---|
| T-07 remainder (case list, dashboard KPIs, notification bell) | Next slice; needs the DB suites runnable to verify |
| T-08 carry-forwards (six above) | Open |
| Retention-review slice (six-state proposal machine) | Deferred by owner decision; its execution side must stay human-gated |
| Pre-launch retention/archival policy (O1) | Required before production; itself human-approved and audited |
| Dockerfile/compose entrypoint | The container runs `npm run dev`, so the production guard and HSTS stay inert as configured. Outside the agent's write scope; owner's call |
| Nine orphaned audit rows (O1) | Retained by owner decision; they self-identify as test data |
| Next.js trailing-slash 308 | Carries no security headers; same-origin redirect serving no body; deliberate deferral to the middleware slice |
| Nonce-based CSP | Landed with T-07 and covered by `csp-nonce.test.ts`; to be confirmed by that slice's review |

## How work is gated

Each slice is implemented, then reviewed by two independent roles whose verdicts are
required together: `privacy-security-guardrail` (runs on a stronger model, pinned per
role) and `qa-release-engineer`. Both write findings to their own file as they go.
Dissent between them is treated as signal, not noise: on R2 the same defect was rated a
blocker by QA and LOW by the guardrail, and the stricter reading was correct.
