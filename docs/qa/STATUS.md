# DSARify / Privacyspace - project status

A consolidated report. Per-prerequisite detail lives in the sibling completion notes;
raw gate evidence is under `/opt/data/qa-tmp/`.

> **Read `git log` before trusting this file.** It has already drifted once: it claimed
> T-08 was unverified for several commits after both gates had approved it (`2dfd1a3`,
> recorded in `c43001e`). The log and the per-slice notes are authoritative; this page is
> a summary of them.

## Position

**M0 Foundation (R1-R4) complete and gate-approved. T-08 (authentication, sessions, RBAC,
authorization seam) complete and gate-approved. The domain layer (Phase 1), host routing,
the case list, the direct dashboard, the notification bell, the sign-in landing page, the
TOTP MFA step, and the case cockpit (tab shell, Overview, Audit log, Data-source checklist,
Identity, Approval & response, Erasure outcomes, Collection & redaction, Evidence pack, and the
Agency dashboard (Client workspaces table)) are all
implemented AND gate-approved (guardrail APPROVE + QA PASS; evidence under /opt/data/qa-tmp/).
The evidence-pack PDF renderer + signed expiring links (Option 3 storage slice) are
implemented AND gate-approved (guardrail APPROVE 0/0/5, LOWs recorded as decisions; QA PASS
after a mutation-coverage recheck). Redacted-export storage + signed-link sharing (the second
artifact type) is also implemented AND gate-approved (guardrail APPROVE 0/0/6, LOWs fixed or
recorded; QA PASS after a recheck). The redacted-export upload UI (file-picker → presigned
PUT → record) is implemented AND gate-approved (guardrail APPROVE 0/0/2, LOWs fixed; QA PASS
after a recheck). In-app file preview with "Open original · logged" is implemented AND
gate-approved (guardrail APPROVE 0/0/1 after the blur HIGH was fixed; QA PASS). The
active-workspace switcher (multi-workspace auth path) is implemented AND gate-approved
(guardrail APPROVE 0/0/3, LOWs fixed; QA PASS + lean recheck PASS).**

| Prerequisite | Verdict | Commit |
|---|---|---|
| R1 tenant/audit substrate, least privilege | guardrail APPROVED (LOW, 3 rounds) + QA PASSES | `16ce851` |
| R2 file/URL contract | guardrail APPROVE R2 HARDENING (LOW, 3 rounds) + QA PASS | `c21c2d7` |
| R3 config & transport guards | guardrail APPROVE R3 (LOW, 3 rounds) + QA PASS | `e45214f` |
| R4 human-gated erasure contract | guardrail APPROVE R4 + QA PASS | `984a071` |
| T-08 auth substrate | guardrail **APPROVE T-08** + QA **PASS** (18/18 gate items) | `2dfd1a3` |
| Domain port (Phase 1) | **guardrail APPROVE + QA PASS** (0 CRITICAL, 0 HIGH, 2 LOW - both closed) | `2eba546` |
| Host routing (4 surfaces, www, TXT-gated custom domains) | **guardrail APPROVE + QA PASS** | `1477812` |
| T-07 case list (views, filters, bulk, CSV, empty/skeleton) | **guardrail APPROVE + QA PASS** (11/11 gate items) | `5029e60` |
| T-07 direct dashboard (KPIs + Needs attention) | **guardrail APPROVE + QA PASS** (QA FAILed once, rechecked PASS) | `a5b39d7` |
| T-07 notification bell | **guardrail APPROVE + QA PASS** (QA FAILed once, rechecked PASS) | `1e5b3a4` |
| Sign-in landing page + magic-link host origin | **guardrail APPROVE + QA PASS** | `1082077` `1be2665` `578912c` |
| TOTP MFA step (`/mfa`) | **guardrail APPROVE + QA PASS** (QA FAILed once on two untested paths, rechecked PASS; 3 LOWs closed) | `74f6741` `f29f07d` |
| Case cockpit (tab shell, Overview, Audit log) | **guardrail APPROVE + QA PASS** (QA FAILed once on tab fallback, rechecked PASS) | `10bb37d` `3b723b8` |
| Case cockpit — data-source checklist | **guardrail APPROVE + QA PASS** (4 LOWs closed, rechecked PASS) | `b0726ef` `57188e6` |
| Case cockpit — identity | **guardrail APPROVE + QA PASS** (4 LOWs closed, rechecked PASS) | `20856e0` `26b6725` `06a8975` |
| Case cockpit — approval & response | **guardrail APPROVE + QA PASS** (QA FAILed once, rechecked PASS; 1 LOW closed) | `da21c3c` `bc0ca62` |
| Case cockpit — erasure outcomes (Collection tab, Erasure branch) | **guardrail APPROVE + QA PASS** (R4 contract consumed; 2 HIGH + 2 LOW closed, then 1 HIGH regression closed) | `de76800` `41927e7` |
| Case cockpit — Collection & redaction (Access) | **guardrail APPROVE + QA PASS** (3 LOWs closed, rechecked APPROVE 0/0/0) | `a26686a` `56f0ed2` `5505221` |
| Case cockpit — Evidence pack | **guardrail APPROVE + QA PASS** (2 LOWs closed, rechecked APPROVE 0/0/0; PDF/signed-links deferred) | `95ac675` `35ca6fd` `11007a4` |
| Agency dashboard (Client workspaces table, memberships model) | **guardrail APPROVE + QA PASS** (HIGH seed name-collision closed; composite-FK migration 0026 applied; rechecked APPROVE 0/0/1 + PASS 895/895) | `bb33a60` `06b549c` `4c4ba2f` |
| Evidence-pack PDF renderer + signed expiring links (Option 3 storage slice) | **guardrail APPROVE (0/0/5, LOWs recorded) + QA PASS** (909/909; mutation coverage rechecked after first FAIL) | `f86cce4` `1a55238` `11f2ddf` |
| Redacted-export storage + signed-link sharing (second artifact type) | **guardrail APPROVE (0/0/6, LOWs fixed/recorded) + QA PASS** (915/915; flaky case-number + sha256 coverage fixed, rechecked) | `c2a8ebd` `875e7d3` |
| Redacted-export upload UI (file-picker → presigned PUT → record) | **guardrail APPROVE (0/0/2, LOWs fixed) + QA PASS** (919/919; forward-list + permission-source + SSE echo coverage, rechecked) | `a9b1cdf` `fddb0e4` `d8ebc5f` |
| In-app file preview ("Open original · logged") | **guardrail APPROVE (0/0/1, HIGH fixed then rechecked) + QA PASS** (932/932; content endpoint refuses originals, signed-URL gate, cross-workspace fixture) | `3dcef8f` `8a41a66` `df00df4` |
| Active-workspace switcher (multi-workspace auth path + agency sidebar) | **guardrail APPROVE (0/0/3, LOWs fixed) + QA PASS** (943/943; per-workspace role + fail-closed fallback + session rotation, lean recheck PASS) | `ea3d765` `5dd1670` |
| "My tasks" view for system owners (gap G8) | **guardrail APPROVE (0/0/2, LOWs fixed) + QA PASS** (947/947; owner/open-case/role-gate filters, role-gate test hardened, lean recheck PASS) | `3027915` `7814d64` |
| Public intake form (first intake sub-slice) | **guardrail APPROVE (0/0/4, LOWs fixed) + QA PASS** (956/956; Host-only tenant resolution + subdomain uniqueness + server-side anti-spam, tenant-from-host mutation-proven, lean recheck PASS) | `5f29a8b` `2ba1f53` |
| Requester portal sign-in + confirmation (G2/G3) | **guardrail APPROVE (0/0/4 after 1 HIGH + 4 LOW fixed) + QA PASS** (964/964; link+code single-use/expiry, IP rate-limit on code redemption, no-enumeration + email-scoped list, confirmation flip+audit atomic, lean recheck PASS) | `240e1fb` `bdf34fd` |
| Requester request detail page (status card + progress) | **guardrail APPROVE (0/0/4, LOWs fixed) + QA PASS** (966/966; email+tenant-scoped detail, plain status/title mapping, terminal-status summary ordering, no internal-field exposure) | `430c7ee` `4f8f7e5` |
| Intake attachments + duplicate-open-case warning (G14) | **guardrail APPROVE (0/0/4 — 2 LOWs fixed, 2 deferred) + QA PASS** (974/974; max-5/10MB/pdf-jpg-png validated server-side, direct S3 store + one case_files row per file, at-submit non-enumerating duplicate notice, Content-Length body guard; 3 mutations RED + lean recheck PASS) | `13b0b67` `a51a533` |
| Requester replies → workspace (G18) | **guardrail APPROVE (0/0/7 — 6 LOWs fixed, 1 deferred) + QA PASS** (983/983; communications table RLS FORCED, email+tenant-scoped message + info upload, requester_upload clears infoRequested, "Requester replied" Handler notification + Overview "Messages from requester" + Identity upload; 5 mutations RED + lean recheck PASS) | `a09156e` `4797132` |
| Deadline extension + approver gate (G15) | **guardrail APPROVE (0/2/4 — both HIGHs + 2 LOWs fixed, 2 LOWs deferred) + QA PASS** (997/997; +1/+2 months capped at 2 total, approver-gated pending sub-state when the flag is on, closed-case + pending-overwrite refusal, "Extension requested" notification keyed off the pending flag; email + settings toggle deferred to G3/G6-G7) | `66c5f73` `6bc9b48` `22b6e8f` |

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

Measured at `HEAD` after the evidence-pack PDF + signed-links slice:

```
919 tests / 78 files    919 passed · 0 failed · 0 skipped
typecheck               0 errors
boundary                139 files, 0 client -> server imports, 0 privileged handles
db:verify               66/66 invariants
migrations              29 applied (journal 0000-0028)
11 domain routes        still stubbed (notImplemented -> 501)
```

**The whole suite is green against the real database.** Earlier measurements in this file
reported 18 failures or 43 skips; those were the DB suites refusing to pass without
credentials, not regressions. The missing piece was the `app_runtime` password - the
least-privilege role every tenant-scoped query uses - which is not the value in
`api/.env.example`. Once the container's own environment was supplied, 40 of the 59
partial-run failures disappeared with it, and the rest with the admin DSN.

Two things this changes about the earlier record: nothing was broken, and the "environmental
failure" caveat can now be deleted rather than carried.

Two practices matter more than the numbers:

- **Falsifiability is demonstrated, not asserted.** R3's QA killed 6 discriminating
  cases; R4's QA ran **mutation testing** (6/6 mutations killed across six assertion
  families) against a scratch copy with the repo byte-verified untouched. This project
  has now shipped four checks that could not fail; that is a standing review item.
- **Partial evidence is never accepted.** Twice, a delegation completed without
  delivering its result, and one of those had found a release blocker that a
  partial-evidence verdict then missed. Every review now writes its findings
  incrementally to its own file, and each review keeps its own evidence chain.

## Domain port (Phase 1) - implemented, gate-approved

Reviewed alongside host routing and the case list. Guardrail: **APPROVE** (0 CRITICAL, 0
HIGH, 2 LOW). QA: **PASS** (11/11 gate items, 747/747 at the time). The two LOWs are fixed:

- **LOW-1**: `BRAND` had been set to "DSARCheck", an unrecorded divergence from the design
  brand "Privacyspace" (only the DOMAIN change is permitted, docs/08 §7). Reverted: the
  product name stays "Privacyspace" in the mail subject, TOTP issuer and page title.
- **LOW-2**: `issueLink` filtered the magic-link user lookup by the raw `email` column on
  top of the hash-scoped RLS policy, so a case-variant stored email would be missed and an
  ambiguous address under-counted. The raw predicate is removed; two new tests (case-variant
  resolves, cross-case ambiguity refused) both fail under the old predicate.

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
our output to match field for field (275 parameterised test cases). A mutation that narrowed a copy
string from 7 to 14 days killed 64 of them. Two findings came out of writing it:

- The seeded demo data does not reach every branch - every seeded Completed system has
  evidence and no seeded case lacks a template. The synthetic cases close that gap; a
  mutation on the "N systems missing evidence" detail survived until they existed.
- The reference omits `deadlineS` on closed cases; ours always returns a string so the UI
  cannot render `undefined`. That divergence is asserted deliberately rather than papered
  over.

## Hosts and surfaces - implemented, ungated

Four origins: `dsarcheck.com` (landing), `admin.dsarcheck.com` (staff), `<slug>.dsarcheck.com`
(one portal per workspace), and `portals.dsarcheck.com` (CNAME target for customer domains).
Decided with the owner and recorded in `design/docs/08` §7.

`src/domain/platform.ts` holds the single copy of the platform domain, brand, slug rule,
reserved names and the two cookie names. `src/domain/host.ts` classifies a `Host` and has no
I/O, so the edge middleware and the tests use the same code. Middleware now:

- refuses a cookie presented on the wrong surface (staff on a portal, workspace on the console,
  and any cookie when the host cannot be classified - fail closed);
- 301s `dsarcheck.com/<slug>/...` to the subdomain, with the query string preserved;
- 301s `www.dsarcheck.com/<path>?<query>` to the apex before any cookie check, so a stale
  cookie cannot turn a permanent redirect into a 401;
- refuses the CNAME target, nested subdomains and every reserved name as a tenant;
- classifies a customer-owned domain as a tenant ONLY once its TXT claim is verified, and
  `domainsEligibleForCertificate()` exposes the provisioning order (TXT first, certificate
  second) so the caller cannot request a certificate for an unverified name.

The slug is per WORKSPACE, not per org: an agency owns several client workspaces, so the
customer's name cannot be the identifier for all of them. Tenant resolution still happens
server-side from the session + RLS; nothing in middleware is an authorization control.

Two consequences worth naming:

- **Deployment, not application:** the apex and the wildcard need separate certificates, and
  custom domains need on-demand issuance after TXT. The app encodes the gate, not the TLS.
- The brand is copy, not configuration. `{slug}.privacyspace.com` in the handoff became
  `{slug}.dsarcheck.com`, and the parity suite normalises the domain before comparing - that
  substitution is the only permitted divergence from the reference.
- `tests/csp-nonce.test.ts` had to gain a `Host` header: without one the middleware cannot
  classify the surface and now refuses a cookie-bearing request. That is the intended
  fail-closed behaviour, and it is asserted separately.

## T-08 - complete (see `T08-COMPLETION-NOTES.md`)

Both gates approved at `2dfd1a3`, after the first review **BLOCKED** `ed938e4` over two
CRITICALs that a green 241-test suite had not caught: redemption was impossible (a
`FOR SELECT`-only token policy meant every valid link returned 401) and MFA was a
deadlock (both TOTP routes called `requireAuth` first).

Carry-forwards, all still open:

1. A future role-change route must call `rotateOnPrivilegeChange` **and** write the
   privilege-change audit event in ONE transaction. No route drives it today.
2. ~~`tests/auth-magic-link.test.ts` passes unchanged under mutation~~ - **RESOLVED**. It now
   redeems a real link through the route, asserts the replay is refused, checks that exactly
   one row is marked used, that an expired link is refused *without* being consumed, and that
   a refusal creates no session. The old "unknown token" test accepted status 0 as a pass,
   so an unrelated crash counted as a refusal; it now requires exactly 401. Three mutations
   (used_at guard removed, expiry guard removed, refusal turned into a 500) each fail it.
3. `users.mfa_required` is a dead column; role policy in `authz.ts` is the live source.
4. ~~The ambiguous-email guard compares the raw email rather than the normalised hash~~ -
   **RESOLVED** (found independently by the host/case-list guardrail as LOW-2). The magic-link
   lookup now relies on the `users_email_lookup` hash policy alone; the redundant raw-email
   predicate is gone, and tests prove a case-variant stored email still resolves while a
   genuinely ambiguous (two rows, one hash) address is refused.
5. A recorded test nit from the guardrail.
6. Multi-workspace sign-in is refused rather than disambiguated - fail-closed, but it
   needs a workspace-selection step before any customer has two.

## T-07 - the case list is built

**Case list (docs/03 § C): complete.** Saved views with counts, search, type and status
filters held in the URL, ordering by nearest deadline (ties by case number), the full table
(checkbox, requester, type, status, owner, received, SLA label + bar, checklist, priority),
bulk assign through the single `ReasonDialog`, audited CSV export, the prototype's empty
state and skeleton rows while loading.

The schema had to move first: `cases` had no owner or requester, and there was no
per-system row, so "4 of 7" was not derivable from anything. Migration `0011` adds
`owner_id`, `requester_name`, `requester_email`, `extension_months` (CHECK 0..2) and a
tenant-scoped `case_systems` table (forced RLS, no DELETE grant, status CHECK); `0012` adds
`users.name`.

Two decisions worth keeping: "My cases" matches on `ownerId` rather than a display name
(two people can be called Priya, and a name match would merge their queues), and a bulk
action is all-or-nothing - one foreign case number aborts the batch before anything is
written, rather than applying to the subset that resolved.

**Dashboard (docs/03 § B, direct): built.** Eight KPI tiles and the "Needs attention" table
with the product's exact ranking (deadline passed → awaiting approval → high-risk identity →
Action required → due within 7 days → identity pending, ties by days left), the empty state
and the "Ordered by what blocks closure first" caption. The tiles read `risk` and `closedAt`,
which migration `0013` added to `cases` (risk CHECK Low/Medium/High; closedAt nullable). The
"Average time to closure" tile is computed from closed cases rather than a seed constant.

**Dashboard and bell gate results.** Guardrail: **APPROVE** (0 CRITICAL, 0 HIGH, 7 LOW). QA
**FAILed the bell on one item** — the entries were buttons calling `window.location.assign`
while the commit claimed "real links" — and the recheck **PASSED** once every entry became an
`<a href>` with the mark-read running alongside navigation. All 7 LOWs were fixed: Completed
vs Rejected in "this month" and the closure average (L-1), workspace-timezone month bucketing
(L-2), user name + "Approver / DPO" label (L-3), owners/admins see both notification lists
while a pure approver sees only the sign-off list (L-4), mark-read validates the key (L-5),
`notification_reads` is insert-only and the revoke survives `db:migrate` via the ensure script
(L-6), and the empty state uses the prototype's copy (L-7).

**Notification bell: built.** The derivation (`domain/notifications.ts`, already tested) is now
wired end to end: `server/cases/notifications.ts` assembles the minimal case shape from the
rows, resolves the approver/handler split through the `approve_closure` permission, reads
the per-user marks, and `markNotificationRead` / `markAllNotificationsRead` persist them as
idempotent upserts (no delete needed, so the no-DELETE invariant is untouched). Migration
`0014` adds `case_systems.name` (so "Production database on Maya's case" names the system
rather than a key) and the `notification_reads` table (forced RLS, no DELETE grant). The
bell lives in the workspace shell with the announced count, the 9+ badge, Escape-to-close
and focus return; "Mark all as read" clears it via a server action.

Still open in T-07:

- The agency "Client workspaces" table (docs/03 § B) - deferred until the multi-workspace
  membership model exists; the current app is single-workspace.
- Cockpit tabs beyond the header (identity, checklist, redaction, erasure, approval,
  evidence) - the cockpit is still header-only.
- Sticky header and sortable columns beyond SLA, which the spec marks as approved
  additions rather than prototype behaviour.
- The "Open public intake form" link points at `/intake`, which the intake slice has not
  built. It should point at the workspace's portal host once a workspace has a slug.

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
