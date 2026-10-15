# Handoff: Privacyspace — DSAR fulfillment platform

Start here. This folder is everything an AI coding agent (Claude Code, Cursor, Lovable, Bolt, v0, Windsurf) needs to build the Privacyspace product with high fidelity to the prototypes.

## What you are building

Privacyspace takes a GDPR data-subject request (DSAR) from public intake to a closed case with evidence. It has four surfaces:

1. **Public intake form**: requester-facing, white-labelled per customer, hosted at `{sub}.privacyspace.com` or a custom domain.
2. **Customer workspace**: where a company's team works cases. Two flavours from one codebase:
   - **Direct** (single company): `reference/prototypes/DSAR Workspace Single Company.dc.html`
   - **Agency** (one agency, many client workspaces): `reference/prototypes/DSAR Workspace.dc.html`
3. **Privacyspace Admin**: internal console for Privacyspace staff, including **Billing & revenue** (subscriptions, payments received, invoices, refunds, plans): `reference/prototypes/Privacyspace Admin.dc.html`
4. **Requester portal**: requester signs in with a magic link or 6-digit code and sees the status of every request, answers identity requests, messages the team and downloads documents: `reference/prototypes/Requester Portal.dc.html`

Transactional emails are specified in docs, not mocked (see `docs/08-gaps-and-decisions.md`).

## About the design files

The files in `reference/prototypes/` are **design references built in HTML**. They show intended look, copy and behaviour. They are not production code. Recreate them in a real app stack (recommended below) using its patterns. Do not ship the HTML or `support.js`.

To view a prototype: open the `.dc.html` file in a browser from this folder (it loads `support.js` beside it). Each prototype is fully clickable with fake in-memory data. A "View as" toggle at the bottom of the sidebar switches role (Admin console: Admin / Support / Billing).

`screenshots/` has 62 captures of every screen and key state, grouped by surface (index in `screenshots/README.md`). They were captured zoomed out to show desktop layout; use the prototypes for exact pixels.

## Fidelity

**High fidelity.** Colors, type, spacing, radii, copy and interactions are final. Match them exactly. Every exact value is in `docs/02-design-system.md`, and every inline style is readable in the prototype source. Copy strings are final: reuse them verbatim (they are in `reference/logic/*.js` and the prototype templates).

Known deviations you SHOULD make (agreed improvements not yet in the prototypes) are listed in `docs/08-gaps-and-decisions.md` § "Approved improvements".

## Reading order

| # | File | Use |
|---|---|---|
| 1 | `AGENTS.md` | Copy to your repo root as `CLAUDE.md` / `AGENTS.md` / `.cursorrules`. Standing rules for the agent. |
| 2 | `docs/01-product-and-roles.md` | Concepts, tenancy, roles, permission matrix |
| 3 | `docs/02-design-system.md` | Tokens, components, exact specs |
| 4 | `docs/03-screens.md` | Every screen: layout, components, copy, states |
| 5 | `docs/04-data-model.md` | TypeScript types + Postgres schema |
| 6 | `docs/05-workflows-and-rules.md` | State machines, gates, the reason-modal pattern, audit events, notifications |
| 7 | `docs/06-backend-security.md` | API, auth, RLS, files, email, DNS, jobs |
| 8 | `docs/07-build-plan-prompts.md` | Phased build, paste-ready prompts, acceptance criteria |
| 9 | `docs/08-gaps-and-decisions.md` | Review results: what is not designed, what was decided, what is open |
| 10 | `docs/09-qa-checklist.md` | Acceptance tests to run after each phase |
| 11 | `docs/10-hermes-agent-setup.md` | How to run this build with Hermes Agent (profiles, SOUL.md, working loop) |

`reference/seed/` holds the prototype seed data and pure helpers (`sla()`, `checks()`, `respText()`) extracted verbatim. Port them to TypeScript and use them as the dev seed so the built app shows the same cases as the prototype.

`reference/logic/` holds the prototype logic classes verbatim. When a doc and the logic disagree, **the logic file wins for behaviour and copy; the docs win for production concerns** (security, persistence, real time).

`reference/spec/` holds the original product spec, MVP spec, security policy and pricing.

## Recommended stack

Use this unless your repo already has one.

- **Next.js 15 (App Router) + TypeScript (strict)**
- **Tailwind CSS v4** with the tokens in `docs/02-design-system.md` as theme variables. No default Tailwind palette in UI code.
- **Radix UI primitives** (Dialog, Popover, Tabs, Select, Switch, RadioGroup) for accessibility; style them to the tokens. shadcn/ui is fine as a starting point if every style is overridden to match.
- **lucide-react** icons (prototype uses Lucide 0.460 icon font; same names in PascalCase)
- **IBM Plex Sans + IBM Plex Mono** via `next/font/google`
- **PostgreSQL** with row-level security; **Drizzle ORM**
- **Auth**: Supabase Auth or Auth.js with TOTP MFA + WebAuthn (staff need security keys)
- **Object storage**: S3-compatible, private bucket, signed URLs
- **Jobs**: a queue (pg-boss on Postgres, or BullMQ + Redis) for reminders, DNS checks, pack generation, purge
- **Email**: Postmark or Amazon SES (per-customer sending domain via DKIM)
- **PDF**: server-side HTML-to-PDF (Playwright) for evidence packs

Lovable/Bolt users: Vite + React + Supabase is acceptable. Keep the same tokens, routes and data model.

## How to use this with an AI coding tool

1. Create an empty repo. Copy this whole folder into it as `/design/`.
2. Copy `design/AGENTS.md` to the repo root as `CLAUDE.md` (Claude Code), `AGENTS.md` (Codex/others) or `.cursorrules` (Cursor).
3. Open `design/docs/07-build-plan-prompts.md`. Paste **one phase prompt at a time**. Do not ask for the whole app in one prompt.
4. After each phase, run that phase's checks in `docs/09-qa-checklist.md` and open the matching prototype side by side to compare.
5. If the agent drifts (wrong colors, invented copy, skipped reason modals), point it back to the specific doc section.
