# 06 · Backend, security and infrastructure

The prototypes are client-only with fake data. Everything here is required for a real product. Source policy: `reference/spec/04-integration-security-policy.md` and `02-mvp-specification.md`.

## Hosts
- `app.privacyspace.com` — workspace app (`/app/...`) and staff console (`/admin/...`, separate auth realm, IP allow-list optional).
- `{sub}.privacyspace.com` and verified custom domains — public portal. Resolve tenant by `Host` header in middleware. Wildcard TLS for `*.privacyspace.com`; on-demand TLS (e.g. Caddy, Cloudflare for SaaS, or Vercel domains API) for custom domains after TXT verification.

## Auth
- Workspace users: email + password or magic link, **TOTP MFA** (enforced when workspace or platform policy says so). Invitations by token; invitee sets up MFA before first sign-in when enforced.
- Staff: SSO or email + **WebAuthn security key required**.
- Sessions: httpOnly secure cookies, 12 h idle timeout for staff, 7 days for workspace (re-auth for sensitive actions optional).
- Requesters: no accounts. Requester portal sign-in by magic link + 6-digit code (docs/05 § Requester portal rules); session cookie scoped to the portal host. Other signed, single-purpose tokens: email-confirm link, document download link (expiring).

## Authorization
Central `can(user, action, resource)` in `src/server/authz.ts` using the matrix in docs/01 plus gates in docs/05. Every server action calls it. Postgres RLS as a second layer. Staff queries on customer data only through grant-checked functions; with no grant, staff endpoints return aggregates (counts) only.

## API surface (server actions or REST — pick one, be consistent)
Public: `POST /p/requests` (intake; Turnstile verify; rate-limit per IP+email; dedupe check) · `GET /p/verify/:token` · `POST /p/track/login` (send link+code) · `POST /p/track/code` · `GET /p/track/link/:token` · `GET /p/track/requests` · `GET /p/track/requests/:id` · `POST /p/track/requests/:id/upload` · `POST /p/track/requests/:id/messages` · `GET /p/files/:signed`.
Workspace: cases CRUD-ish transitions (`startVerification`, `approveIdentity`, `requestInfo`, `rejectRequest`, `extend`, `sendForApproval`, `approve`, `requestChanges`, `refuse`, `sendResponse`, `logManualSend`), systems (`setStatus`, `recordOutcome`, `assign`, `setDue`, `remind`, `comment`), files (`createUploadUrl`, `completeUpload`, `openOriginal`), redaction (`applyRedaction`, `requestReview`, `completeReview`, `generateExport`), evidence (`generatePack`, `download`, `createSignedLink`, `revokeLink`), notes, audit (`list`, `exportCsv`), portal (`checkSubdomain`, `confirmBranding`, `saveRules`, `goLive`, `goOffline`, `addCustomDomain`, `verifyDomain`, `removeDomain`, `verifyMail`, `markPublished`), settings (team, sources, SLA), notifications (`list`, `markRead`, `markAllRead`), support grants (`approveGrant`, `declineGrant`, `endGrant`) — customer side.
Admin: orgs (`setPlan`, `requireMfa`, `suspend`, `reactivate`, `requestSupportAccess`), billing (`listSubscriptions`, `retryPayment`, `extendTrial`, `applyCredit`, `cancelAtPeriodEnd`, `resume`, `refund`, `voidInvoice`, `sendInvoiceReminder`, `revenueSummary`, `exportCsv`), reviews (`approve`, `reject`, `rejectAndReserve`), reserved names, domains (`recheck`, `emailOwner`), grants (`end`), staff (`invite`, `setRole`, `remove`), policies, audit export.
Workspace billing: `getBilling`, `changePlan`, `cancelSubscription`, `createPaymentMethodSession` (provider-hosted), `updateBillingProfile`, `listInvoices`.
Every mutation: authz → validate (zod) → transaction(change + audit event) → enqueue side effects (email, pack, notification) → return new state.

## Files
- Upload via pre-signed PUT to private bucket; server-side encryption (SSE-KMS) with per-workspace key or envelope key.
- Store sha256; show in evidence pack.
- Downloads via short-lived signed GET (≤ 24 h; requester links 7 days after first open, as in response copy).
- Virus scan on upload (ClamAV job) before availability.
- Raw exports purged 30 days after closure (job); keep metadata + hashes + evidence pack.

## Payments
- **Stripe Billing** (decided): Products/Prices for the 3 plans × monthly/annual; metered price for overage DSARs (report usage on each case creation); Customer Portal or Checkout for payment method updates; tax via Stripe Tax (EU VAT, reverse charge with VAT ID).
- Webhooks → `/api/billing/webhook` (verify signature, idempotent): `invoice.created/finalized/paid/payment_failed/voided`, `customer.subscription.created/updated/deleted`, `charge.refunded`, `payment_method.attached`. Update mirror tables and write System staff-audit entries for failures.
- Staff actions call the provider API, then wait for the webhook to confirm state; UI shows pending until confirmed.
- Revenue figures are computed from the mirror tables; reconcile nightly against the provider.
- Dunning emails from the provider are disabled; Privacyspace sends its own (consistent branding, logged).

## Email
- Transactional provider with per-workspace sending identities. Until SPF/DKIM verified: from `no-reply@privacyspace.com`, reply-to privacy email. If a sending domain fails (Admin "Failing") and policy fallback = on, use fallback; if off, hold.
- Templates (**NOT MOCKED**, see docs/08): request received, confirm your email, requester sign-in link + code, more info needed, extension notice, request complete, request could not be completed, reply to requester message, reminder to task owner, escalation, invite, support-access request to owner, invoice/receipt, payment failed, trial ending.

## Background jobs
| Job | Schedule |
|---|---|
| SLA reminders & escalations | daily 09:00 workspace TZ |
| DNS checks (custom + sending domains) | every 6 h; on demand "Re-check DNS" |
| Evidence pack generation (PDF + ZIP) | on demand / on approval |
| Support grant expiry | every 5 min |
| Trial ending reminders (3 days, 1 day before) | daily |
| Billing reconciliation with Stripe | nightly |
| Non-payment suspension (policy.dunning days after final failed attempt) + 1-day warning | daily |
| Requester login token cleanup | hourly |
| Raw export purge (case record and requester view kept) | daily |
| Closed case deletion after retention | daily |
| Signed link expiry cleanup | daily |

## Evidence pack generation
Render the Evidence tab layout server-side to PDF (Playwright), sections 1–9. ZIP = PDF + evidence files + redacted exports + `audit.csv` + `manifest.json` (file list with sha256). Version is immutable once created.

## Observability & ops
Structured logs without PII; error tracking; uptime of portal, email, exports, DNS checks, API → feeds Admin "Service status". Backups daily with PITR. EU data region (Frankfurt).

## Explicit exclusions v1 (from MVP spec)
No autonomous deletion, no mailbox access, no stored DB credentials, no AI training on customer data, no automated legal determinations. Integrations (Zendesk, HubSpot, Postgres agent) are phase-later and must follow the Tier 2/3 human-in-the-loop rules.
