# 09 · QA checklist

Run after each phase. Use the seed data; with `DEV_FIXED_NOW=2026-10-13T10:42` values below should match the prototypes exactly.

## Visual fidelity
- [ ] Each screen side by side with its prototype at 1440px: same layout, spacing, type sizes, colors, copy.
- [ ] No color outside docs/02. No Inter/Roboto/system fallback visible.
- [ ] All status pills = icon + label + tone.
- [ ] Mono font on case IDs, file names, hosts, DNS values.

## Seed spot checks
- [ ] Lumen case list "All open" sorted by deadline; DSAR-2026-00402 shows Extended pill.
- [ ] DSAR-2026-00418 (Access, Maya Lindqvist): checklist "4 of 7", Zendesk file needs redaction with 5 tokens (4 flagged), CTA "Send for approval" disabled with "N items remain".
- [ ] DSAR-2026-00412 (Erasure, Jonas Weber): Mixpanel in Action required; blocker banner shown; Stripe retained under "Legal obligation — tax and accounting".
- [ ] DSAR-2026-00424 (Karl Marsh) High risk, No match, ID doc provided; Handler cannot approve/reject; Approver can.
- [ ] DSAR-2026-00409 (Lumen) in Awaiting approval → appears in Approver notifications as "Approval needed". Notifications are per current workspace: switching to Kesto shows DSAR-2026-00061 instead.
- [ ] Admin overview: 6 orgs, 3 pending subdomain reviews (paypa1-support flagged), 2 non-ok domains, Corvid MFA warning, Public API "Slower than usual".

## Workflow
- [ ] New → Start verification → Approve identity (reason) → checklist generated → audit shows Identity approved + System "Checklist generated (7 systems)".
- [ ] Marking Completed without evidence shows the inline error and doesn't change status.
- [ ] Retained under exception requires category and reason.
- [ ] Send for approval blocked until all 6 checks pass (server rejects too, test with direct API call).
- [ ] Approve and close only as Approver; creates final pack vN by System; closes case; SLA shows "Closed 13 Oct".
- [ ] Request changes returns to In progress and Handler sees "Changes requested" notification with the reason.
- [ ] Extend: max 2 months total; deadline moves; requester email queued; Extended pill.
- [ ] Redaction: new redaction after review resets review; export only after review done; original preserved.
- [ ] Response only after Completed; manual copy logs an event; auto-send off by default.
- [ ] Signed link expiry options; downloading logs an event; expired link returns 410.

## Audit
- [ ] Every reason-required action (docs/05 list) writes an event with the entered reason.
- [ ] UPDATE/DELETE on audit tables fails at DB level.
- [ ] CSV export works and is itself logged.

## Security
- [ ] User in workspace A cannot read any row of workspace B (RLS test with direct SQL as app role).
- [ ] Staff without a grant gets counts only; with an active "Settings and portal only" grant cannot read case contents.
- [ ] Grant auto-ends at expiry; removing staff ends grants.
- [ ] Suspended org: members can't sign in; portal still accepts requests; reminders still run.
- [ ] Files only via signed URLs; bucket is private; raw exports purged 30 days after close.
- [ ] MFA enforced when policy/workspace requires; staff need security key.

## Portal
- [ ] Subdomain: invalid format, reserved ("stripe"), taken ("acme"), matching ("lumen" for lumen.io → instant), non-matching → review created in Admin.
- [ ] Go live disabled until steps 1–3; Take offline requires reason; offline form shows privacy email.
- [ ] Intake validation messages verbatim; duplicate warning for an email with an open case; success shows reference + due date one month out.

## Billing
- [ ] Admin Revenue: MRR €1,063, ARR €12,754, Received in October €738, Outstanding €79, 1 trial (Corvid, ends 21 Oct).
- [ ] Needs attention order: Mirabel payment failed → Corvid trial ending → Okto over usage (31 of 25, €60 overage).
- [ ] Okto next invoice shows €259 incl. €60 overage; applying €25 credit makes it €234.
- [ ] Retry payment on Mirabel: invoice paid, subscription active, org reactivated automatically with a System audit entry.
- [ ] Non-payment job: with policy 3 days, an org whose final attempt failed 3 days ago is suspended by System; a manual suspension is not lifted by payment.
- [ ] Stripe `invoice.paid` webhook for a non-payment-suspended org reactivates it.
- [ ] Refund creates a negative row, original shows Refunded, totals update (Received / Refunded / Net).
- [ ] Void the overdue invoice: subscription leaves Past due.
- [ ] Support role: every billing action disabled with the read-only note; Billing role: billing actions enabled, policies/staff locked.
- [ ] Every billing action writes a Billing staff-audit event with reason.
- [ ] Webhook replay is idempotent; signature failures rejected.
- [ ] Plan limits never block intake (create a case over the included count).
- [ ] Workspace Settings › Billing & usage: change plan dialog, cancel requires reason, invoices downloadable.

## Requester portal
- [ ] Sign-in with an unknown email still shows "Check your email"; no email sent.
- [ ] Code: wrong length error; code single-use; "Send a new code" invalidates the old one; 15-minute expiry.
- [ ] Requester sees only requests for their email in this workspace; another workspace's portal shows none.
- [ ] Info requested in workspace → portal shows the upload card; upload appears in the case and notifies the handler; SLA unchanged.
- [ ] Extended case shows the notice and new date; completed case shows documents only after Send response.
- [ ] No internal notes, system names, staff names or risk visible anywhere in the portal.
- [ ] Idle 30 minutes → signed out.
- [ ] After the raw-export purge, a completed request still shows status, timeline, details and messages, with the "We deleted the files…" card instead of downloads.

## Accessibility
- [ ] axe: 0 violations on every route.
- [ ] Keyboard only: open a case from the list, switch tabs (arrow keys), complete a ReasonDialog, close with Escape, focus returns to trigger.
- [ ] Notification panel: Escape closes, focus returns to bell, badge has aria-label "Notifications, N unread".
- [ ] Reduced motion disables all transitions.
- [ ] Primary controls ≥ 44px.
