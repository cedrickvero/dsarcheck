# T-08 - Authentication, sessions, TOTP, RBAC: COMPLETE

Both gates approved at `2dfd1a3`.

| Gate | Verdict | Evidence |
|---|---|---|
| privacy-security-guardrail | **APPROVE T-08** (after BLOCKing `ed938e4`) | `/opt/data/qa-tmp/T08-REVIEW.md`, `T08-DELTA.md` |
| qa-release-engineer | **T-08 QA: PASS** (18/18 gate items) | `/opt/data/qa-tmp/T08-QA.md` |

Commits: `52ea408` (substrate), `ed938e4` (suites), `2dfd1a3` (CRITICAL fixes + migration 0008).

## What T-08 delivers

Magic-link + TOTP sign-in, opaque sessions, the authorization seam, tenant resolution and
DB-backed rate limiting. Five routes exist; the 11 domain stubs remain 501.

Migration `0007` adds `users`, `sessions`, `magic_links`, `mfa_totp`, `rate_limit_hits` -
RLS enabled and forced, tenant policies, least-privilege grants with no DELETE, plus
`cleanup_rate_limit_hits()` as a SECURITY DEFINER function so rate-limit rows can expire
without granting the app role DELETE on any table.

## The two CRITICALs, and what they taught

The first review **BLOCKED** this slice. A green suite of 241 tests told us nothing about
whether a user could actually sign in:

1. **Sign-in was impossible.** Redemption is an UPDATE, but the token policy was declared
   `FOR SELECT` only, so with no tenant set the UPDATE matched zero rows and every valid
   link returned 401. The session store escaped the same bug only by accident -
   `resolveSession` sets `app.workspace_id` before its own UPDATE.
2. **MFA was a deadlock.** requireAuth refuses an MFA-outstanding session, but both TOTP
   routes called it first, so owner/approver/workspace_admin could never enrol or verify.
   Fixed with `requireAuthForMfaStep`, a partial gate whose narrowness is enforced by a
   test that walks src/ and fails if anything but the two TOTP routes imports it.

## Verification defects - the pattern to watch

This project has now shipped **three** checks that could not fail, and a fourth that is
merely weak. Two were in this slice:

- The "redeems a link exactly once" test fed token `"x"` and asserted only that a boolean
  came back - **it would have passed both mutations**, including with sign-in completely
  broken. Deleted.
- `tests/auth-magic-link.test.ts` still passes unchanged under mutation (it never
  exercises a successful redemption). Its generic-response, no-row-for-unknown-address and
  hashed-at-rest assertions are real; its single-use coverage is not. **Carry-forward.**
- Real coverage for redemption and concurrency now lives in `tests/auth-mfa-step.test.ts`:
  a real end-to-end redemption through the route, and ten simultaneous redemptions
  yielding exactly one success.

Both gates independently mutation-tested a scratch copy and confirmed the replacements
CAN fail. Mutation testing is now the standard for a slice that touches anything security
relevant, not a nicety.

## Independently verified by QA (not taken from the guardrail)

- **Real sign-in end to end:** seeded user -> link delivered to MailHog -> callback 200 ->
  that cookie authenticates `POST /api/auth/sign-out` 200 -> replay 401.
- **MFA is not a deadlock:** an MFA-outstanding owner enrols 200, verifies 200, and the
  full gate opens only afterwards; every other route stays 501/401.
- **Concurrency:** ten simultaneous redemptions -> exactly one 200, across three rounds,
  with `used_at` set on exactly one row.
- **Tenant isolation** proven on the least-privilege `app_runtime` pool: other-tenant rows
  invisible, unset tenant fails closed, caller-supplied workspace -> 403.

## Stated, not assumed - what was NOT verified

- **Production cookie hardening** (`Secure`, `__Host-` prefix) - code-conditional and no
  production boot was performed.
- **`auth.mfa.verified`** was not emitted live, because enrolment and verification happen
  in one step for a first-time owner.
- **Privilege-change auditing has no driving route** (see carry-forward 1).
- **Retention-review** is deferred to its own slice by owner decision.

## Carry-forwards

1. **Required follow-up (guardrail ruling b):** the future role-change route must call
   `rotateOnPrivilegeChange` **and** write the privilege-change audit event in ONE
   transaction. `rotateOnPrivilegeChange` does not self-audit, and no route drives it
   today. This note is the record the guardrail asked for.
2. ~~**Harden `tests/auth-magic-link.test.ts`**~~ - **DONE.** It now redeems a real link
   through the callback, proves the replay is refused, asserts exactly one row is marked
   used, that an expired link is refused without being consumed, and that a refusal creates
   no session. The old unknown-token assertion accepted status 0 - an unrelated crash passed
   as a refusal - and now requires exactly 401. Mutation-checked: removing the `used_at`
   guard, removing the expiry guard, and turning the refusal into a 500 each turn it red.
3. **LOW-1:** `users.mfa_required` is a dead column - role policy in `authz.ts` is the live
   source of truth. Remove it or make it authoritative.
4. **New LOW:** the ambiguous-email guard compares the raw `email` rather than the
   normalised hash (pre-existing, fails closed, case-sensitivity edge).
5. **LOW-2:** a test nit, recorded by the guardrail.
6. Multi-workspace sign-in: an address belonging to two workspaces is currently REFUSED
   rather than disambiguated. That is fail-closed, but it needs a workspace-selection step
   before any customer has two.

Still open from earlier: the **deferred retention-review slice** (six-state proposal
machine, human-gated execution), the **pre-launch retention/archival policy** (O1), the
**Dockerfile/compose entrypoint** question, and nonce-based CSP at T-07.
