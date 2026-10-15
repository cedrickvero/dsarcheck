# 01 · Product, tenancy and roles

## Tenancy hierarchy

```
Privacyspace (platform)            ← staff use Admin console
└── Organization (customer)        ← billing entity; kind = Direct | Agency; plan = Starter | Growth | Agency
    └── Workspace                  ← one per company whose requests are handled
        ├── Portal                 ← public intake at {sub}.privacyspace.com or custom domain
        ├── Data sources (systems) ← checklist template
        ├── Members (with roles)
        └── Cases (DSARs)
```

- **Direct org** = 1 workspace (Starter 1, Growth up to 3). The UI is the *Single Company* prototype: nav label "Dashboard", "Request portal"; no workspace switcher.
- **Agency org** = many client workspaces (Agency plan, 15). The UI is the *Agency* prototype: "Agency dashboard" across clients, sidebar **client workspace switcher**, "Clients & portal" with a **Client access** tab.
- Build ONE workspace app; switch by `org.kind`. Differences are listed in docs/03 § "Direct vs Agency differences".

## Workspace roles

| Role | Prototype persona | Responsibility |
|---|---|---|
| Request handler | Priya Shah | Runs cases day to day: verifies identity, collects data, redacts, drafts response, sends for approval |
| System owner | Ravi Menon, Ana Costa, Leo Brandt | Searches their own system, uploads evidence, records status/outcome |
| Approver / DPO | Daniel Okafor | Signs off closure, decides high-risk identity checks, completes redaction review. Doesn't work the case |
| Workspace admin | Sara Lind (direct) / Mara Voss (agency) | Configures team, sources, SLA, portal |
| Agency user | Jakob Lund | Handler across assigned client workspaces |

Role hint copy (sidebar, verbatim):
- Handler: "Handler: runs the case day to day. Verifies identity, collects data from each system, redacts and drafts the response, then sends it for approval."
- Approver: "Approver (DPO): signs off before a case closes, decides high-risk identity checks and completes redaction review. Doesn’t work the case."

### Permission matrix (Settings › Team & roles, verbatim)

| Permission | Handler | System owner | Approver | Admin |
|---|---|---|---|---|
| View and update cases | ✓ | ✓ | ✓ | ✓ |
| Record system outcomes | ✓ | ✓ | ✓ | ✓ |
| Approve identity | ✓ | – | ✓ | ✓ |
| Approve closure | – | – | ✓ | ✓ |
| Export evidence packs | ✓ | – | ✓ | ✓ |
| Configure workspace | – | – | – | ✓ |

Additional enforced gates:
- **High-risk identity** decisions (approve / request info / reject) require Approver. Handlers see "High-risk: approver role required".
- **Complete redaction review** requires Approver.
- **Approve and close / Request changes / Reject with documented reason** require Approver.
- System owners only see and edit tasks assigned to them (production rule; prototype shows all).

## Privacyspace staff roles (Admin console)

| Role | Persona | Can |
|---|---|---|
| Platform admin | Noor Haddad | Everything: orgs, plans, suspend, MFA enforcement, reserved names, staff, policies |
| Support | Elif Demir, Tom Ruiz | Review subdomains, check domains, request support access. **Can't** change plans, policies or staff |
| Security | Kai Nieminen | Read all staff audit, manage staff security keys. No billing or customer actions |
| Billing | Ines Farah | Billing & revenue: retry payment, extend trial, apply credit, cancel/resume, refund, send reminder, void invoice. **Can't** open customer workspaces, change policies or manage staff |

Billing actions are allowed for Platform admin and Billing. Support sees Billing & revenue read-only ("Read-only. Billing changes need a Platform admin or Billing.").

Role hint copy (verbatim):
- "Platform admin: manages organizations, plans, suspensions, reserved names, staff and policies."
- "Support: reviews subdomains, checks domains and requests time-limited access to customer workspaces. Can’t change plans, policies or staff."

- "Billing: manages subscriptions, payments, refunds and invoices. Can’t open customer workspaces, change policies or manage staff."

Staff sign-in requires a hardware security key (WebAuthn). Staff see **request counts only**, never case contents, unless a support grant is active.

## Requesters (data subjects)
No account or password. A requester signs in to the requester portal on the customer's portal host with their email: a single-use magic link plus a 6-digit code (15 min expiry). The session sees only requests submitted with that email, for that workspace. Idle timeout 30 minutes.

## The "View as" toggle
Prototype-only. In production the role comes from the signed-in user. Keep a dev-only role switcher behind an env flag for demos.
