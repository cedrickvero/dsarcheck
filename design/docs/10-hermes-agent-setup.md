# 10 · Running the build with Hermes Agent

> Updated to match this workspace. The original handoff described two profiles
> (`privacyspace` + `privacyspace-review`) rooted at `~/code/privacyspace`.
> This environment runs a **Director plus nine role profiles** rooted at `/workspace`.

## Profiles (actual)

Ten profiles live under `/opt/data/profiles/` — the Hermes home here is `/opt/data`,
not `~/.hermes`.

| Profile | Job |
|---|---|
| `director` | Owns the roadmap and backlog, coordinates the nine roles, enforces the gates. Plans, delegates, verifies, reports — never implements. |
| `product-architect` | Ideas → PRDs, contracts, implementation tickets |
| `product-designer` | Tickets → screen specs, component contracts, copy |
| `frontend-coder` | UI implementation from designer specs |
| `backend-coder` | API routes, data, services, jobs |
| `integration-engineer` | Scoped, auditable integrations |
| `privacy-security-guardrail` | Reviews personal data, OAuth, retention, AI, deletion, files, audit logs |
| `qa-release-engineer` | Tests, tenant isolation, RBAC, audit events, release readiness |
| `ops-evidence-auditor` | Case and evidence-pack completeness |
| `growth-gtm-analyst` | Positioning, demand validation, pricing |

**Do not run several profiles writing code in the same repo at once.** The phases
depend on each other (tokens → domain → DB → screens) and parallel writers create
merge conflicts and duplicated components. The director serialises the work.

## Repo layout (actual)

```
/workspace/                 ← start Hermes here; not yet a git repository
├── AGENTS.md               ← project rules + context discipline (canonical)
├── api/                    ← Next.js 15 (App Router) application
└── design/                 ← this handoff: docs/, reference/, screenshots/
```

Hermes loads `AGENTS.md` from the working directory at session start. Only one
context file is used (`.hermes.md` > `AGENTS.md` > `CLAUDE.md` > `.cursorrules`),
so do not add a second one. Context files are cut off at 20,000 characters —
keep `AGENTS.md` short and leave detail in `design/docs/`, read on demand.

## 1. Point each profile at the repo

```bash
hermes -p director config set terminal.cwd /workspace
```

**Container caveat:** the session may present the repo root as `/workspace` or as
`/workspace/workspace` depending on which container is serving. Check `hostname`
and `$HERMES_WRITE_SAFE_ROOT`, and detect the root by looking for the directory
that contains both `api/` and `design/`.

## 2. SOUL.md — identity, not project rules

Personas live at `/opt/data/profiles/<name>/SOUL.md`. Each is re-read every turn,
so keep them short. Project rules belong in `AGENTS.md`, not in the persona.

## 3. Working loop

```bash
hermes -p director -z "Open the project. Read design/README.md and design/docs/08, \
  inspect api/, then produce your status report and the next tickets."
# delegate the tickets the director names, e.g.
hermes -p backend-coder -z "T-07: port src/domain/* from design/reference/seed/workspace-seed.js"
# review before merging
hermes -p privacy-security-guardrail -z "Review the domain slice for copy and data-handling risks."
hermes -p qa-release-engineer -z "Verify the domain slice against design/docs/09-qa-checklist.md"
```

- One phase at a time; do not start the next until the current one passes its
  checks in `design/docs/09-qa-checklist.md`.
- Start a fresh session per phase so earlier phases do not fill the context.
- Correct a profile once and it keeps the memory.

## 4. Model routing

See `AGENTS.md` § Model routing. Short version: deepseek-flash by default;
escalate to deepseek-v4-pro for privacy/security review, OAuth/PII/retention/
deletion/AI handling, audit-log or RLS/authz/tenant-isolation correctness,
multi-step architectural reasoning, high-risk integration design, or debugging
after two failed attempts.

## 5. Secrets

Keep keys in `/opt/data/.env` and each profile's `.env`. Never commit them, and
never write them into `api/.env.example`.

## 6. Before development starts

- Initialise git at `/workspace` if you want version control and per-phase commits.
- Run `npm install` inside `api/`, then `npm run db:generate` / `npm run db:migrate`
  against a reachable Postgres.
