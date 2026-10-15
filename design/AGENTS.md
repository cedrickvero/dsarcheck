# Agent rules for the Privacyspace codebase

Copied to the repo root as `/workspace/AGENTS.md` (now the canonical file — this copy keeps the
handoff self-contained). Design references live in /design.

## Source of truth
- Visual and copy fidelity: `/design/reference/prototypes/*.dc.html`. Open them in a browser and compare side by side.
- Behaviour and exact copy strings: `/design/reference/logic/*.js`.
- Tokens: `/design/docs/02-design-system.md`. Never use colors, radii or font sizes not listed there.
- Production rules (security, data, jobs): `/design/docs/05-*.md` and `/design/docs/06-*.md`.
- If something is not covered, check `/design/docs/08-gaps-and-decisions.md` before inventing. If still not covered, ask; do not guess on compliance behaviour.

## Non-negotiables
1. **Every sensitive action requires a reason** captured in a confirmation dialog, and writes an immutable audit event (actor, action, category, reason, object, timestamp, IP/session). The list of actions is in docs/05 § "Reason-required actions".
2. **No autonomous actions.** Nothing deletes data, closes a case or sends a final response without an explicit human click. Auto-send of final responses is off by default.
3. **Tenant isolation.** Every row has `workspace_id` (and `org_id`). Enforce with Postgres RLS, not only in app code.
4. **Privacyspace staff never see case contents** unless a customer-approved, time-limited support grant is active, and then only within the granted scope.
5. **Role gates are enforced server-side.** UI disabling is a convenience, not security.
6. **SLA is always visible** on case lists and the case header: remaining time label + risk + thin progress bar.
7. **Status is never color-only.** Every pill = icon + label + color.
8. **Copy:** reuse prototype strings verbatim. Tone is calm and operational. Never write "guaranteed compliance", "automatic legal determination", "AI-approved". Keep the legal disclaimer in the workspace sidebar.
9. **Accessibility:** 44px min targets for primary controls, visible teal focus ring (`2px solid #14919B`, offset 2px), Escape closes dialogs/popovers, focus trapped in dialogs and returned to the trigger on close, `prefers-reduced-motion` respected.
10. **Dates:** display as `13 Oct 2026` / `13 Oct` / `13 Oct 2026, 10:42` (24h). Store UTC; display in workspace timezone.

## Code conventions
- TypeScript strict. Shared domain types in `src/domain/` (port from docs/04).
- Pure domain logic (sla, progress, pre-closure checks, response text, notification derivation) in `src/domain/` with unit tests. Port from `/design/reference/seed/workspace-seed.js`.
- One `ReasonDialog` component used for every reason-required action (see docs/02 § Confirmation dialog).
- Mutations go through server actions / API routes that (a) check role, (b) validate, (c) write the change and the audit event in **one transaction**.
- Don't add features, sections, stats or copy that aren't in the prototypes or docs.
