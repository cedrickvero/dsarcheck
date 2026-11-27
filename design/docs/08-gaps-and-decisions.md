# 08 · Review: gaps, decisions and open questions

Result of reviewing the prototypes against the product spec, MVP spec, security policy and pricing. Each gap has a default so the build can proceed; change the default if you disagree.

## 0. Resolved in round 2 (now designed)
- **Requester portal** (was G1): sign-in with link + code, your requests, request detail with progress, info upload, extension notice, documents, messages → `Requester Portal.dc.html`, docs/03 § H2.
- **Admin billing & revenue**: revenue overview, subscriptions, payments, invoices, plans, and billing actions → Admin › Billing & revenue, docs/03 § I.
- **Customer billing** (was part of G6): Settings › Billing & usage in the direct workspace.
- **Billing / Security staff role scopes** (was G17): docs/01.
- Intake success now links to the requester portal ("Track your request").

## 1. Not designed (build from spec + design system)

| # | Gap | Spec ref | Default to build |
|---|---|---|---|
| G1 | ~~Requester status portal~~ | — | **Designed** (see §0) |
| G2 | **Email confirmation landing** | MVP §2 | Small card: "Email confirmed" + reference + "Track your request". Sets `emailVerification=Confirmed`, logs "Email address confirmed" as requester. |
| G3 | **Transactional emails** (10 listed in docs/06) | design spec 6.2 | Table-based HTML, 600px, brand header (initial tile + company), body 15px, one primary CTA in brand color, footer with privacy policy, contact, and "This email confirms receipt only and is not legal advice." Subjects: use the comms subjects in the logic file ("We received your data request", "We need more information to verify your identity", "We need more time to complete your request", "Your request is complete", "Your request could not be completed"). |
| G4 | **Auth screens**: sign-in, MFA setup/challenge, invite accept, staff security-key | MFA required | Centered 400px card on `#F7F8FA`, Privacyspace brand tile, teal primary. |
| G5 | **Customer-side support-access approval** | Admin › Support access | Banner in workspace for owners: "{Staff} from Privacyspace asks to open {workspace} for 24 hours · {scope} · Reason: {reason}" with Approve / Decline (reason). Active grant shows a persistent bar "Privacyspace support has access until {time}" + "End access". Logged in workspace audit. |
| G6 | **Settings › Templates, Security & audit** (Billing now designed) | IA §5 | Templates: list of 6 response templates, editable body with merge fields. Security: workspace audit log (same pattern as case audit, workspace-wide). Agency workspace: Billing & usage lives at org level — reuse the direct layout with a per-client usage table. |
| G7 | **Data source add/edit** | spec 6.14 | Side panel form: name, sub, owner, method, instructions, evidence requirement, default SLA days, active. |
| G8 | **Approvals, Tasks, Evidence library pages** in IA | IA §5 | Not needed for v1: Approvals = "Awaiting approval" view; Tasks = system owner "My tasks" view (**build this**: system owners need a list of their assigned systems across cases). Evidence library deferred. |
| G9 | **Onboarding / trial** | pricing: 14-day trial with one sample request | First sign-in creates workspace with a sample case (use DSAR-2026-00418 seed) and lands on Portal setup. |
| G10 | **Workspace deletion workflow** | MVP security | Settings › Security: "Delete workspace" (admin, reason, typed name confirm, 7-day grace). |
| G11 | **Plan limits** | pricing | Enforce workspace count & seat limits; DSAR overage is billed, never blocks intake. |
| G12 | **Responsive / mobile** | not specified | Desktop-first ≥1280. Intake + status portal must be fully responsive (they already reflow). App: at < 1024 collapse sidebar to 64px icon rail (spec), cockpit rail below content. |
| G13 | **Loading, error, offline states** | spec 4 (skeletons) | Skeleton rows for tables, skeleton blocks for cards; inline error with retry; optimistic updates only for notes/comments. |
| G14 | **Intake attachments + duplicate warning** | spec 6.1 | Intake prototype's "Choose files" is inert; implement (max 5 files, 10 MB, pdf/jpg/png). Duplicate warning exists in Workspace logic (`ikDup`) but not on Intake Form: show an info notice when an open case exists for that email, still allow submit. |
| G15 | **Extension pending approval** | spec 7 extension flow | When "Approver reviews extensions" is on, extension enters "Extension requested" sub-state; Approver approves before requester notice. |
| G16 | **Sidebar collapse to 64px** | spec 3 | Add toggle; persist per user. |
| G17 | ~~Staff roles Security & Billing scopes~~ | — | **Defined** in docs/01 |
| G18 | **Requester replies in the workspace** | requester portal | Inbound requester messages and uploads appear in the cockpit Overview ("Messages from requester" card) and as a Handler notification "Requester replied"; uploads appear in Identity tab under the info request. |
| G19 | **Billing emails** (invoice/receipt, payment failed, trial ending) | pricing | Same email shell as G3 with Privacyspace branding (not customer brand). |
| G20 | **Billing edge cases** | pricing | Proration on upgrade, downgrade blocked if workspaces/seats exceed target plan ("Remove N workspaces first"), VAT reverse-charge display, failed card on upgrade. Build in provider; show provider error copy in the dialog. |
| G21 | **Revenue reporting depth** | admin | Prototype shows MRR, cash by month, MRR by plan. Churn, net revenue retention and cohort views deferred; add only if asked. |

## 2. Approved improvements (apply during build)
From the Apple-guidelines review:
1. **Motion**: dialogs, popovers, dropdowns, notification panel fade + slide (spec in docs/02). Tab content cross-fade 120ms. All disabled under reduced motion.
2. **Keyboard**: Escape closes every dialog/popover/menu; focus trap in dialogs; return focus to trigger; roving tabindex in tablists; arrow keys in radio groups; tables operable with Enter.
3. **Heading tracking**: −0.01em on 24px+, −0.005em on 18px.
4. **Persistent status** over 4-second toasts for compliance-critical results (list in docs/02 § Toast). Implement as a `StatusLine` component inside the affected card + the audit entry; toast only for trivial actions.
5. Notification panel above all content (z-index fixed) and overdue wording "Overdue by N day(s)" (already in logic).

## 3. Decisions already made (keep)
- **Payment provider is Stripe** (Stripe Billing, Stripe Tax, Customer Portal, webhooks).
- **Suspension for non-payment is automatic**: the System suspends the org a set number of days after the final failed payment attempt (platform policy, default 3 days; options 3/7/14). Paying the invoice (customer card update, Stripe retry or staff retry) reactivates it automatically. Manual suspension by a Platform admin still exists for other reasons and needs manual reactivation.
- **Completed requests stay visible to requesters after their files are deleted**: status, timeline, request details and messages remain in the requester portal for the workspace retention period; the documents section shows the deletion date instead of downloads.
- Staff see request **counts only** unless a customer-approved grant is active.
- Suspending an org keeps portals live and deadlines running.
- Final responses are never auto-sent unless the workspace turns it on.
- Evidence pack is never plan-gated.
- Direct and Agency share one app.
- Subdomain names that don't match the verified domain go to manual review; brand names are reserved.

- **G14 (intake attachments + duplicate warning) is implemented at-submit, not as a live check.** A live "does this email already have a request?" endpoint would be an enumeration oracle that contradicts the sign-in's "we never show whether an email address has a request" promise, so the duplicate check runs server-side inside the submit transaction (case-insensitive, open cases only — not Completed/Rejected) and the notice renders on the confirmation screen referencing the existing case; the new case is always recorded, so the requester still submits once. The attachment limits (max 5, ≤10 MB each, PDF/JPG/PNG) and the notice/error copy ("Attach up to 5 files.", "… is larger than 10 MB.", "… is not a PDF, JPG or PNG.", "You already have an open request about this email (reference …). Your new request has been recorded separately.") are new strings — the prototype's Choose-files control was inert, so there was no reference copy to reuse. Attachments store directly to object storage server-side (no signed URL, because the files arrive in the no-JavaScript multipart POST) and record one `case_files` row per file (`uploaded_by` null, `is_evidence` false, `version` 1, key `intake/{workspace}/{case}/{uuid}`). Two LOWs are explicit deferrals: (a) the type filter is MIME-or-extension only — no magic-byte/content sniffing, so stored files are untrusted content and the retrieval slice must re-validate and force `application/octet-stream` on serve; (b) the `intake/` key namespace is write-only until the retrieval slice adds a download path that understands it (the signed-URL `ws/` parser rejects it, which fails closed). The whole multipart body is capped by a `Content-Length` guard (`MAX_INTAKE_BODY_BYTES`) before buffering so a public client cannot exhaust memory ahead of the per-file caps.

## 4. Open questions for the product owner
7. Which Privacyspace legal entity issues invoices, and in which country (VAT)? (default: Privacyspace GmbH, Germany)
1. Case ID sequence: global or per workspace? (default: per workspace)
2. Identifier matching: manual only in v1, or a customer-provided lookup webhook? (default: manual)
3. Which email provider and which PDF renderer are acceptable sub-processors? (default: Postmark, self-hosted Playwright)
4. Requester status portal: magic link only, or also reference + email lookup? (default: magic link only)
5. Is "Restriction" a v1 request type? Portal rules offer it; intake form lists 5 types. (default: show on intake only when enabled in rules)
6. Timezone for deadlines: workspace TZ, end of day? (default: deadline = same calendar date next month, end of day workspace TZ)

## 5. Prototype-only things to drop
"View as" role switch (keep behind dev flag), "Simulate customer approval" button, the fake "I am not a robot" checkbox, "Open link (prototype)" on the requester code screen, the requester `scenario` prop and `window.__rp` hook, fixed date 13 Oct 2026, fake IP/session strings, `support.js`.

## 6. Consistency fixes to make while building
- Workspace seed is "Single Company" with Sara Lind; Agency with Mara Voss — keep both personas in seed per org kind.
- Admin ORGS lists Northlight's workspaces with hosts that differ from workspace `seedPortal()` (e.g. Kesto `kesto-health` in review vs no subdomain). Use the **Admin** values as canonical seed for portal state, and update the workspace seed to match.
- Intake form uses UK spelling "Privacy request centre"; app uses US ("Organization", "anonymized"). Keep as-is (requester-facing copy is UK/EU English), but don't mix within a surface.
- Billing seed: Lumen (direct workspace prototype) shows Growth €199 with its own invoices, while in Admin seed Lumen is a Northlight client (billed under Northlight's Agency plan). In the built seed, keep Lumen as a Northlight client and create a separate direct org for the direct-workspace demo (e.g. "Lumen Analytics (direct demo)").
- Invoice numbers: workspace billing seed (INV-2026-0142/0127/0110) and admin seed (0098–0141) overlap in range; renumber when seeding a single sequence.

## 7. Platform domains and surfaces (owner decision)

The product ships on **dsarcheck.com**. Four surfaces, four origins, deliberately separate:

| Host | Serves | Session |
|---|---|---|
| `dsarcheck.com` | Landing, legal, pricing. No tenant, no authenticated content. | none |
| `www.dsarcheck.com` | 301 to the apex, preserving path and query. Serves nothing. | none |
| `admin.dsarcheck.com` | Staff console (organizations, billing, subdomain reviews, domains, staff). | staff only |
| `<slug>.dsarcheck.com` | One customer portal. Tenant is resolved from the `Host` header alone. | workspace only |
| `portals.dsarcheck.com` | CNAME target for verified customer domains. Serves no page itself. | — |

Decisions that follow, all recorded in code under `api/src/domain/platform.ts` and `api/src/domain/host.ts`:

- **`www` is a permanent redirect, not a second landing origin.** One canonical marketing URL, one certificate to keep valid, and an origin whose cookie jar stays empty. The redirect happens before any cookie check, so a stale cookie cannot turn it into a 401.
- **Custom domains are gated on TXT ownership verification.** A claim record carries `txtVerifiedAt`; until it is set, the host resolves to `unknown` and is indistinguishable from a stranger's domain. `domainsEligibleForCertificate()` only returns verified, un-certificated, un-removed claims — so the provisioning loop has no path that requests a certificate for an unverified name. Verification is expressed as a claim row rather than a `Set<string>` of "verified" hosts, because a set can be populated from an unverified row by mistake and the mistake is invisible.

- **`slug` is per workspace, not per organisation.** An agency owns several client workspaces, so the customer's name cannot be the identifier for all of them.
- **`dsarcheck.com/<slug>` is a 301 to the subdomain**, never a served form. Path-based tenants share one origin, so they would share cookies, cache and CSP.
- **No `Domain=.dsarcheck.com` cookie, ever.** Both session cookies are `__Host-` in production, host-only by definition. A domain-scoped cookie would be readable by every tenant subdomain, so one tenant's XSS would become every tenant's session.
- **Two cookie names, not one**: `__Host-dsar_session` (workspace) and `__Host-dsar_staff_session` (staff). A cookie presented on the wrong surface is refused, not interpreted.
- **Reserved names include the infrastructure**: `www admin api app portals status support mail cdn staging …` plus the product's own words, so no tenant can shadow a surface or imply an endorsement.
- **What the application cannot do, and must not pretend to:** the apex and `*.dsarcheck.com` need SEPARATE certificates (a wildcard never covers its apex), and customer-owned domains need on-demand certificate issuance after the TXT check passes. Certificate provisioning and DNS remain deployment-platform responsibilities; the app's job is to refuse to classify an unverified custom domain as a tenant, and to expose which domains are eligible.
- **Brand substitution is deliberate**: the handoff's copy says `{slug}.privacyspace.com`; the product says `{slug}.dsarcheck.com`. This is the ONLY permitted divergence in copy, and `api/tests/domain-parity.test.ts` normalises the domain before comparing against the reference.

- **Checklist status changes always require a reason**, including "In progress" and
  "Completed" - the prototype's `setSys` applies those without one. This is stricter than
  the handoff and deliberate: the reason is the audit row's "why", and the audit invariant
  (every sensitive action records a reason) overrides the prototype's convenience. The
  reason is also stored on the system row for the outcome states. Recorded here so the
  divergence is a decision, not an accident.

- **Erasure outcomes require evidence or an attached outcome record.** The R4 contract's
  `evidenceRequirementSatisfied` rule is enforced at the case layer: deleted / suppressed /
  retained-under-exception / not-found each need either a stored evidence ref or the
  handler's "Outcome record attached" confirmation; only "Action required" is exempt. This
  is stricter than the prototype (which records an outcome with no evidence gate) and is
  deliberate — it matches the R4 erasure policy, which is the gate-approved authority.

- **The requester-never-decides invariant is consumed but not yet exercisable at the case
  layer.** `assertRequesterIsNotTheDecider` is called with `requesterActorId: null` because
  the current model stores the requester as an external email (`cases.requester_email`), with
  no linkage from a requester to a workspace actor. The invariant is retained as a
  placeholder so that the day a requester↔actor link exists, the rule fires without a code
  change; until then it is a no-op, not a protection gap (an external requester cannot hold
  a workspace role today).

- **Complete redaction review requires every flagged item to be redacted first.** The
  prototype's pre-closure "Redaction reviewed" check passes on `review done AND export
  generated` regardless of whether flagged items remain unredacted, which would let a
  redacted export ship with unresolved personal data. The slice is stricter: an approver
  cannot complete the review while any flagged token is unredacted. This is a deliberate
  tightening of the redaction rule, not a defect.

- **Generating the final redacted export is a state marker in this slice.** `final_export_done`
  records that the human has produced the `_redacted_v2` file; the actual file creation
  (a new `case_files` row whose `is_redacted_export` is set, original v1 untouched) belongs to
  the file-upload/storage slice, which is deferred. The rule "export only after review done"
  is enforced here regardless, so the state can never claim an export exists before review.

- **The E4a file-preview control is deferred to the storage slice.** "Original v1 ·
  access-controlled", the blurred preview, and "Open original · logged" (which needs a
  per-viewer logged-reason gate, docs/03 E4a / docs/05) require the file-bytes pipeline that
  this slice does not build. No original content is rendered anywhere today, so nothing is
  exposed; when the preview is built it MUST ship with the logged-reason gate, not as a plain
  viewer.

- **The evidence pack stores the document, not the download.** `evidence_packs` snapshots the
  nine-section document (`content`) and tracks version + draft/final state; the PDF/ZIP render,
  the "Download" with its 24-hour signed link, and "Share signed link" (expiry + recipient/purpose
  reason + access logging + 410 on expiry, docs/05 § Evidence pack) belong to the storage slice
  and are deferred. "Generate/Regenerate" and the approval auto-final are implemented and
  audited here, so the version history is correct even though the bytes are not yet rendered.

- **`memberships.workspace_name` is denormalised** (the `workspaces` table's RLS is
  `id = app.workspace_id`, so a sibling workspace's name is not readable under the tenant GUC).
  There is no rename feature today, so no sync path exists; when workspace rename lands it MUST
  update `memberships.workspace_name` for every row of that workspace in the same transaction,
  or the agency dashboard will show stale client names.

- **The evidence-pack storage slice (PDF renderer + signed links) has LANDED**, superseding the
  deferral above. The nine-section pack renders to a deterministic PDF (`server/cases/evidence-pdf.ts`),
  is served through an authenticated endpoint, and a 24h single-use signed link can be issued and
  downloaded through the token-gated route. `artifact_type` is `evidence_pack | redacted_export`.

- **Redacted-export sharing (the second signed-link artifact type) has LANDED; the upload UI has
  not.** `issueSignedLink`/`consumeSignedLink` and the token download route now handle
  `artifact_type = redacted_export`, binding the link to a `case_files` row's sha256 and streaming
  the object from storage. `recordRedactedExport` (in `server/cases/collection.ts`) stores the
  human-produced `_redacted_v2` file (version 2, never an overwrite) + the `finalExportDone` flag
  + the audit event in one transaction. It is not yet wired to a route/button: the existing
  "Generate final redacted export" button still calls the flag-only `markFinalExportDone`, so the
  live app cannot yet record an export. Wiring the upload + record into the UI is the next follow-on
  (needs the file-picker → presigned PUT → record flow). In-app preview remains deferred.

- **Signed-link expiry is hardcoded to 24 hours, not the selectable 24h/7d/30d (default 7d) in
  docs/05.** The owner's storage-slice spec pins 24 hours ("Links expire after 24 hours"), and 24h
  is strictly more restrictive than the 7d default. Selectable TTLs, if ever wanted, are an additive
  change to `LINK_TTL_HOURS`; the server-side expiry mechanism (the `expires_at` column checked in the
  atomic consume UPDATE) is already TTL-agnostic.

- **The signed-link URL is `/api/evidence/access?token=…`, not the designed
  `https://{portalHost}/e/{id5}-{token}`.** The portal-host format belongs to the multi-tenant
  portal surface, which is a separate slice; the token-in-path/query-string tradeoff is the same
  either way (single-use + 24h server-side expiry bound the exposure). Consistent with the existing
  magic-link `?token=` pattern.

- **`recipient_type` is free text with no DB CHECK; `artifact_type` is now CHECK-constrained.**
  Migration 0028 adds `signed_links_artifact_type_check` (`evidence_pack | redacted_export`), so
  the polymorphic discriminator is structural. `recipient_type` remains metadata written only
  through the RBAC-gated issuance route (the UI offers a fixed set) with no access-control effect;
  a vocabulary CHECK for it is a cheap follow-on if a recipient-type list is codified.

- **The signed-link token travels in the URL query string**, so it can appear in browser history,
  access logs and Referer headers. This is inherent to a shareable link and matches the magic-link
  pattern; single-use + 24h server-side expiry bound the exposure. No action beyond the existing
  controls.

- **The denial path is measurably slower than the unknown-token path** (a denied token writes an
  audit row before returning the identical 404; an unknown token does not). Status and body are
  indistinguishable (the enumeration-oracle criterion is met); exploiting the timing difference
  requires already holding a valid-but-denied 256-bit token, which is not a practical oracle.

- **There is no "revoke a link" action — `revoked_at` is forward-looking.** The storage-slice spec
  enumerates `revoked` as a failure state the download endpoint must reject, which the atomic consume
  predicate does (`revoked_at IS NULL`), but no slice has a revoke-now action to set it. A leaked link
  is currently neutralised by single-use and 24h expiry; an explicit revoke is a follow-on if wanted.
