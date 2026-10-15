# R4 - Human-gated erasure/retention contract: COMPLETE

Both gates approved at `984a071`. **No autonomous deletion path exists.**

| Gate | Verdict | Evidence |
|---|---|---|
| privacy-security-guardrail | **APPROVE R4** | `/opt/data/qa-tmp/R4-REVIEW.md` |
| qa-release-engineer | **R4 QA: PASS** | `/opt/data/qa-tmp/R4-QA.md` (300 lines) |

Commits: `d9d9201` (L1/L2 config hygiene, kept separate so R4 stays purely R4) and `984a071` (the contract).

## What R4 delivers

Contract layer plus tests only, by owner decision: **no table, no migration, no route.** The erasure route stays 501. The immutable audit event IS the record of a decision until the data-source/system entity exists and a proper `erasure_outcomes` table can carry FKs, RLS and a tenant policy.

- `src/server/erasure/outcomes.ts` - the frozen five outcomes with the spec's labels verbatim, each carrying all five rules, so an outcome cannot be added without answering every question.
- `src/server/erasure/policy.ts` - the four retention exception categories copied byte-identically from `design/docs/04`'s own TypeScript union (the guardrail verified the em dash by codepoint, U+2014), the evidence-or-outcome-record rule, and the pre-closure rule that no `Action required` may remain.
- `src/server/erasure/approval-gate.ts` - named-human-actor, high-risk-is-Approver-only, requester-may-never-decide, decider != approver for high-risk, Retained-requires-approver-review.
- `src/server/erasure/decide.ts` - the single human-gated path: authorization, then Zod validation, then ONE transaction containing the decision and its immutable audit event.

## The contract of record (owner-approved)

Outcomes: Deleted; Suppressed/anonymized; Retained under exception; Not found; Action required.

28 tests across 4 suites; all 14 contract items verified by both gates.

## The denylist is NOT the control - read this before extending the contract

`assertNamedHumanActor` refuses missing, empty and `system`/`worker`/`cron`/`scheduler`/`job`/`automated` actor ids. QA correctly observed that this is a **fixed name list**, so a caller-supplied id like `purge-bot` would pass it.

That is acceptable *only because of what actually enforces the rule*:

1. **No destructive operation exists in the codebase at all.** Both gates independently enumerated the whole tree: no `DeleteObjectCommand`/`DeleteObjectsCommand` (`s3Client.ts` builds Get/Put only); no `db.delete`/`.delete(`/`DELETE FROM`/`TRUNCATE`/`DROP TABLE`; the `purge` queue is a **name with no processor** (`startWorkers()` only logs); the four erasure modules are imported **only by their tests** and wired to no route, queue, worker or cron.
2. **The production actor will come from the T-08 auth seam**, not from a caller.

So the denylist is defence-in-depth, never the control. If a future slice adds a real destructive operation, the denylist must NOT be treated as its gate - the gate is the human approval plus reason plus same-transaction audit event, and the DB-level revoke of DELETE from both app roles. Extending this contract without that understanding would be a way to lose the property.

## Evidence highlights

- No-destruction-path enumeration performed **twice, independently** (guardrail, then QA without trusting the first).
- **Falsifiability: 6/6 mutations killed** across six assertion families (human-actor guard 6 fails, evidence rule 3, category validator 2, action-required gate 1, requester check 1, high-risk gate 2) - run against a scratch copy, with the repo byte-verified untouched.
- **Rollback reproduced three ways:** success leaves exactly 1 audit row; a self-constructed FK failure leaves no decision and 0 rows; a direct `withTenant` insert-then-throw leaves 0 rows while insert-then-commit leaves 1.
- 55/55 route x method combinations remain 501 with the envelope `{error:{code,message,requestId}}`; 7 migrations = 7 journal entries = 7 applied, none touched; 4 live tables, no erasure/purge table.
- 210 tests in 23 files, typecheck 0, boundary 55 files/0 violations, `db:verify` 42/42.

## Deviation, recorded and adjudicated

`decide.ts` **composes** the mutate() pattern rather than calling `mutate()`. Reason: `mutate()` calls `requireAuth()` (a hard 501 until T-08) and consults the static permission matrix, so it cannot be exercised at the contract layer, and adding an injectable actor to the single write path would create the second, bypassable authorization path the owner has ruled out. The guardrail adjudicated this **ACCEPTABLE**: ordering identical, the audit insert still exists in exactly one place (`src/server/db/audit.ts:38`), no second authorization path, no audit-without-decision and no decision-without-audit.

## Carried forward to T-08 (all LOW/INFO, none blocking)

1. `decide.ts` reason schema says `min(1)` while the audit writer requires `min(3)`. The writer wins, so it fails closed and the effective rule is the stricter one; align the schema wording.
2. `approval-gate.ts` exports `DECIDING_ROLES` but nothing references it - enforcement belongs to the T-08 permission source. **T-08 must make it load-bearing or delete it.**
3. `domain/types.ts` says `suppressed_or_anonymized` where the erasure contract says `suppressed` - align during the T-08 naming pass.
4. The non-human actor denylist is a name list; the T-08 seam is where actor identity becomes trustworthy.

Also still open from earlier: the Dockerfile/compose entrypoint question (the container runs `npm run dev`), and the pre-launch retention/archival policy (O1), which must itself be human-approved and audited.
