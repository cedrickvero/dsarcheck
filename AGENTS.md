# Agent rules — hermes_dsar

Standing rules for any agent working in this repository. Read before acting.

This file supersedes `design/AGENTS.md`, which is the handoff's original copy.
Keep the product rules below in sync with it if the design package is updated.

## Repository map

| Path | What it is |
|---|---|
| `/workspace/api` | Next.js 15 (App Router) application. Route handlers under `src/app/api/**`. Server-only logic in `src/server/**`, `src/db/**`, `src/auth/**`, `src/jobs/**`, `src/lib/**`. Pure domain logic in `src/domain/**`. Background worker: `src/worker.ts` (separate BullMQ process). |
| `/workspace/design` | Design handoff — the source of truth for behaviour and copy. `docs/01`–`10`, `reference/{logic,prototypes,seed,spec}`, `screenshots/`. |

**Never modify:** `docker-compose.yaml`, `.env`, Docker volumes, or infrastructure configuration.

## Source of truth

- Visual and copy fidelity: `/design/reference/prototypes/*.dc.html`. Open them in a browser and compare side by side.
- Behaviour and exact copy strings: `/design/reference/logic/*.js`.
- Tokens: `/design/docs/02-design-system.md`. Never use colours, radii or font sizes not listed there.
- Production rules (security, data, jobs): `/design/docs/05-*.md` and `/design/docs/06-*.md`.
- If something is not covered, check `/design/docs/08-gaps-and-decisions.md` before inventing. If still not covered, ask; do not guess on compliance behaviour.

## Non-negotiables

1. **Every sensitive action requires a reason** captured in a confirmation dialog, and writes an immutable audit event (actor, action, category, reason, object, timestamp, IP/session). The list of actions is in docs/05 § "Reason-required actions".
2. **No autonomous actions.** Nothing deletes data, closes a case or sends a final response without an explicit human click. Auto-send of final responses is off by default.
3. **Tenant isolation.** Every row has `workspace_id` (and `org_id`). Enforce with Postgres RLS, not only in app code.
4. **Privacyspace staff never see case contents** unless a customer-approved, time-limited support grant is active, and then only within the granted scope.
5. **Role gates are enforced server-side.** UI disabling is a convenience, not security.
6. **SLA is always visible** on case lists and the case header: remaining time label + risk + thin progress bar.
7. **Status is never colour-only.** Every pill = icon + label + colour.
8. **Copy:** reuse prototype strings verbatim. Tone is calm and operational. Never write "guaranteed compliance", "automatic legal determination", "AI-approved". Keep the legal disclaimer in the workspace sidebar.
9. **Accessibility:** 44px min targets for primary controls, visible teal focus ring (`2px solid #14919B`, offset 2px), Escape closes dialogs/popovers, focus trapped in dialogs and returned to the trigger on close, `prefers-reduced-motion` respected.
10. **Dates:** display as `13 Oct 2026` / `13 Oct` / `13 Oct 2026, 10:42` (24h). Store UTC; display in workspace timezone.

## Code conventions

- TypeScript strict. Shared domain types in `src/domain/` (port from docs/04).
- Pure domain logic (sla, progress, pre-closure checks, response text, notification derivation) in `src/domain/` with unit tests. Port from `/design/reference/seed/workspace-seed.js`.
- One `ReasonDialog` component used for every reason-required action (see docs/02 § Confirmation dialog).
- Mutations go through server actions / API routes that (a) check role, (b) validate, (c) write the change and the audit event in **one transaction**.
- Don't add features, sections, stats or copy that aren't in the prototypes or docs.
- Database, authorization, audit, queue, storage and email logic must never be imported into a client component (`npm run lint:boundary` in `api/`).

## Context discipline

- Never read an entire repository by default.
- Never load screenshots, prototypes, or large assets unless the task explicitly requires them.
- Never load unrelated modules, tests, or documentation.
- Before reading a file, state why it is necessary.
- Prefer targeted reads: specific files, line ranges, symbols, routes, tables.
- Prefer diffs over full files.
- Prefer summaries and indexes over raw long documents.
- If context is missing, ask for the specific file, path, symbol, or decision.
- If the task cannot be completed safely with the available context, stop and request the minimum missing context.

## Do not read

`node_modules/`, `.next/`, `.env`, Docker volumes, generated build output, and screenshots or large binaries unless explicitly required and approved.

## Context budget

Before starting a task, output a `### Context plan` containing:

- Task type: implementation / review / planning
- Required context
- Files to read
- Files excluded
- Estimated context size
- Model choice: deepseek-flash or deepseek-v4-pro
- Reason for model choice

**Wait for approval** only when the task is:

- a major architecture change
- privacy or security sensitive
- a deletion, retention, OAuth, AI, or audit-log change
- unusually large context

Otherwise proceed.

## Model routing

**Default: deepseek-flash** — routine implementation, simple UI, copywriting, test scaffolding, status reporting, documentation updates, simple refactors.

**Escalate to deepseek-v4-pro** for:

- privacy or security review
- OAuth, PII, retention, deletion, or AI data handling
- transaction, audit-log, tenant-isolation, authz, or RLS correctness
- difficult debugging after two failed attempts
- multi-step architectural reasoning
- high-risk integration design

Never escalate for routine tickets, simple UI, copywriting, test scaffolding, status reporting, documentation updates, or simple refactors.

## Output discipline

- Keep responses concise.
- **Implementation:** what changed, where, why. Show diffs or short snippets, not whole files. State the verification performed.
- **Review:** findings first, ordered by severity, each with `file:line`. Then required changes.
- **Planning:** the plan, the files to be touched, the risks, the open questions.
- No preamble, no restating the request, no filler.

## Prompt caching discipline

- Stable instructions first, dynamic content last.
- Put ticket text, diffs, and error messages at the end of the prompt.
- Do not reorder or reword standing instructions between turns.

## Environment notes

- This session's container `cwd` may show the repository root one level up or down
  (`/workspace/api` versus `/workspace/workspace/api`). Verify with `hostname` and
  `$HERMES_WRITE_SAFE_ROOT` before writing, and detect the root by looking for the
  directory that contains both `api/` and `design/`.
- The Hermes home is `/opt/data` (profiles, skills). Do not write application code there.
