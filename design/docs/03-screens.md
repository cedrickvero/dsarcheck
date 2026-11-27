# 03 · Screens

Every screen below exists in a prototype unless marked **NOT MOCKED**. Line numbers point at the template in `reference/prototypes/` so the agent can read exact inline styles. Copy in quotes is verbatim.

## Routes

| Route | Screen | Prototype |
|---|---|---|
| `/{portalHost}/` | Public intake form | Intake Form.dc.html |
| `/{portalHost}/track` | Requester sign-in (email → link + code) | Requester Portal.dc.html (signin, code) |
| `/{portalHost}/track/requests` | Requester: your requests | Requester Portal (list) |
| `/{portalHost}/track/requests/[id]` | Requester: request detail | Requester Portal (detail) |
| `/{portalHost}/verify/{token}` | Email confirmation landing | **NOT MOCKED** |
| `/app/[ws]/dashboard` | Dashboard (direct) / Agency dashboard | Workspace L86 |
| `/app/[ws]/cases` | Case list | L119 |
| `/app/[ws]/verify` | Identity verification queue | L168 |
| `/app/[ws]/cases/[id]?tab=` | Case cockpit (tabs: overview, identity, checklist, work, approval, evidence, audit) | L237 |
| `/app/[ws]/portal?tab=` | Request portal / Clients & portal (setup, portal/branding, access) | L597 |
| `/app/[ws]/settings?tab=` | Settings (team, sources, sla, billing) | L734 (billing: Single Company only) |
| `/admin/{overview,orgs,billing,reviews,domains,access,staff,policy,audit}` | Admin console (billing has `?tab=revenue|subs|payments|invoices|plans`) | Admin |
| `/login`, `/mfa`, `/invite/[token]` | Auth | **NOT MOCKED** |

Tabs and selected items should be in the URL so links and back/forward work.

---

## A. Workspace app shell (Workspace L29–L85)

Grid: `240px minmax(0,1fr)`, min-height 100vh.

**Sidebar** (`#0B1F3A`, sticky, scrolls itself):
1. Brand row: 30px teal tile with shield-check icon, "Privacyspace" (white 700), **bell button** (see notifications) on the right.
2. **Agency only:** client workspace switcher: button `#173A5E` with `1px #24507A`, caption "Client workspace", current client name, chevrons-up-down. Menu lists clients with 24px initial tile and a check on the current one; header "Northlight Privacy · 4 clients". **Direct:** a static block with caption "Workspace" + name.
3. Nav (`aria-label="Main"`), items 44px, 3px left bar `#14919B` when active, bg `#173A5E` active/hover, count badge `#24507A`:
   - Agency: "Agency dashboard" (layout-dashboard) · "Cases" (inbox, open count) · "Identity verification" (user-check, queue count) · "Clients & portal" (building-2) · "Settings" (settings)
   - Direct: "Dashboard" · "Cases" · "Identity verification" · "Request portal" (globe) · "Settings"
   - "Cases" is active also inside the cockpit.
4. Bottom (margin-top auto): dev-only role switch ("View as (prototype)", segmented Handler/Approver) + role hint; user row (32px teal avatar with initials, name, role); disclaimer 11px `#9FB0C6`: "This product helps teams manage and document data-subject requests. It does not provide legal advice or guarantee regulatory compliance."

**Notifications** (L33): role-specific, derived (docs/05 § Notifications). Popover anchored right of the sidebar. Empty state text in prototype L33+.

---

## B. Dashboard

**Agency** — title "Agency dashboard", subtitle "Northlight Privacy · all client workspaces · today, 13 Oct 2026".
- 8 KPI tiles, grid `repeat(auto-fit,minmax(200px,1fr))`: Open cases · Due within 7 days (`#B54708`) · Overdue (`#B42318`) · Awaiting approval · High-risk verifications · Systems in Action required · Completed this month (`#0E6B4D`) · Average time to closure ("10.6 days"). Each: icon, label, big value.
- Card "Client workspaces" / "Sorted by nearest deadline per client". Table: Client (initial tile + name + domain) · Open · Due ≤ 7 days · Overdue (red bold if > 0) · Awaiting approval · Action required (amber if > 0) · Avg. closure · Next deadline (SLA label + case ID) · "Open cases" button → switches workspace and goes to Cases.

**Direct** — title "Dashboard", subtitle "{client} · today, 13 Oct 2026". Same 8 tiles scoped to the workspace, then card "Needs attention" / "Ordered by what blocks closure first". Table: Case (mono ID + "type · name") · Next required action (600) · Status pill · Owner · SLA · "Open case". Ranking:
1. "Statutory deadline passed" 2. "Awaiting approval by {approver}" 3. "High-risk identity check" 4. "N system(s) in Action required" 5. "Due within 7 days" 6. "Identity verification pending"; ties by days left. Empty: "Nothing needs attention. New requests appear here when they need a decision."

---

## C. Case list (L119)
- Header: "Cases" / "{client} · sorted by deadline, nearest first"; right: outline link "Open public intake form" (external-link icon) opens the portal in a new tab.
- Saved views (chips with counts): All open · My cases · Due soon · Awaiting approval · Overdue · Closed.
- Filters row: search input (ID, name, email), Type select (All, Access, Erasure, Portability, Rectification, Objection), Status select (All + 7 statuses).
- Bulk bar when rows selected: "{n} selected" · Assign owner · Export selected · Clear.
- Table columns: [checkbox] · Case ID (mono) · Requester (name + email) · Type · Status pill · Owner · Received · "SLA ↑" (label + bar) · Checklist ("4 of 7") · Priority ("High" pill or blank). Sorted by days left ascending. Row click / Enter opens cockpit. Checkbox click doesn't open.
- Empty: "No cases in this view" + "New requests from the intake form appear in All open. Approved requests appear here before final response and evidence export."
- Approved additions (spec, not in prototype): sticky header, sortable columns, skeleton rows while loading.

## D. Identity verification queue (L168)
- Header: "Identity verification" / "{client} · fulfillment starts only after identity is approved".
- 4 tiles: Awaiting review · High risk · Verified today · Rejected (30 days).
- Filter chips: All · High risk · Email pending (with counts).
- Two-column: table left, detail panel right (grid `minmax(300px,420px)` panel; see L168–236).
- Table: Case / requester · Type · Identifier (match pill) · Email (pill) · ID doc ("Provided"/"None") · Risk pill · SLA · Reviewer (first name). Selected row teal-100 with 3px teal left bar.
- Detail panel: ID, name, email, risk pill; rows Request / Identifier / SLA; identifier match result + note; email status + note ("Confirmation link opened from the submitting address." / "Confirmation link sent {date}. Not yet opened."); **ID document (masked)**: blurred card (blur 7px) with "Open document · logged" button → reason dialog, then unblurred; filename `id_document_{id}.jpg`. Reviewer note textarea + "Save note". High-risk + Handler → amber notice "High-risk request. Approve or reject requires the Approver / DPO role. You can still request more information." Buttons: Approve identity (primary) · Request more information · Reject (danger outline) · "Open case cockpit →".
- Empty: "No requests awaiting verification" / "New submissions appear here once the requester confirms their email."

## E. Case cockpit (L237)

**Header card** (L239–278):
- Breadcrumb "Cases / {ID}" + copy-ID icon button.
- h1 "{Type} request · {Name}".
- Pills: status · SLA "{label} · {risk}" · "Extended 1 month/2 months" (if any) · "High priority".
- Right: "Extend deadline" outline (when open and < 2 months extended) + context **primary CTA** (docs/05 § CTA). Disabled CTA shows lock + note below.
- Meta row (border-top): Owner · Approver · Received · Statutory deadline (600) · Requester email.
- 6-step stepper: Received · Identity · Checklist · Collection & redaction | Erasure outcomes · Approval · Evidence pack.

**Body**: flex-wrap: main tab card (`flex:999 1 600px`) + right **rail** 340px (collapsible to 56px via toggle; collapsed shows remaining count badge). Rail (L544+): SLA card (label, bar, received → "risk · due date") · "Before closure · {done} of {total}" with each check (icon, label, status, detail; click → tab) and remaining label ("N items remain before closure" amber / "Ready for approval" / "Closed with evidence" green) · "Recent activity" (last 5 audit events) + "View full audit log →".

**Tabs** with badges: Overview · Identity ("!" if not verified) · Data-source checklist ("4/7") · Collection & redaction (unredacted flagged count) or Erasure outcomes (Action required count) · Approval & response · Evidence pack ("v2") · Audit log (count).

**E1 Overview** (L287): grid `repeat(auto-fit,minmax(300px,1fr))`. "Request" (quoted details, Requester, Identifier, Channel "Hosted intake form", Next reminder), "Systems" (progress "4 of 7 systems complete", %, bar, "Open checklist", link to work tab), "Files" list, "Internal notes" (newest first, textarea + "Add note").

**E2 Identity** (L321): Email confirmation, Identifier match + note, Risk, ID doc line; recorded decision box "Decision recorded by {by} · {at} · {reason}"; high-risk handler notice "…Switch role in the sidebar to continue." (production: "Ask an Approver to decide."); actions as in queue + "Open in verification queue".

**E3 Data-source checklist** (L339): if identity pending, banner "Identity verification required. Tasks are sent to system owners once identity is approved." + "Go to identity". Header "{n of 7} systems complete · tasks due before {deadline}" + "Remind open task owners". Bulk bar: Assign tasks · Send reminders · Change due dates · Mark as not found. Grid rows `40px minmax(150px,1.3fr) 120px minmax(150px,1.3fr) 70px 170px 80px 40px`: checkbox · Data source (name + "sub · N comments") · Owner · Search method · Due · Status pill · Evidence ("N files"/"None") · chevron. Expanded row: Instructions + "Evidence required: …"; Owner select; Status buttons (In progress, Completed, Not found, Action required, Retained under exception; active one tinted); error "Attach evidence before marking this system Completed."; exception category + reason when set; Evidence list + "Upload evidence"; Comments + input + "Post"; "Last change: {actor} · {time}".

**E4a Collection & redaction** (non-erasure, L399): three panels (`220px | 1fr | 320px`-ish; see source). Left: Files list (name, "sys · type · size", "Needs redaction"/"Redacted export" tags) + "Upload file". Centre: amber warning "{n} flagged items may contain third-party or confidential data"; file header "Original v1 · access-controlled"; preview blurred (6px) with "Preview hidden. The original contains unredacted personal data." + "Open original · logged" (reason dialog). Document tokens are buttons: flagged = `#FDF0DC` bg `#DC6803` border; other PII = `#EEF1F4` `#98A2B3`; redacted = navy block "█ {category}". Selecting a token opens an inline redact form: quoted text, Category select (6 categories), "Reason (required)", Apply redaction / Cancel. Helper: "Select highlighted text to redact it. Amber highlights are flagged as third-party or confidential." Right: "Redaction log" (category, reason, by · at; empty "No redactions applied yet.") and "Review & export": review pill (Not reviewed / Review requested / Review complete), Request review (handler) → Complete review (approver; handler sees "Waiting for Daniel Okafor. Switch to Approver to complete the review.") → "Generate final redacted export" (disabled hint "Available after redaction review.") → "Final export generated. Original preserved as v1."
Production: real file viewer (PDF.js) with text-selection or box redaction; same log/review/export flow.

**E4b Erasure outcomes** (erasure, L440+): intro "Deletion, suppression and retention are recorded separately. Select a card to record or change its outcome." Blocker banner "{n} system(s) is/are in Action required. The case cannot enter approval until it is/they are resolved." or ok line "No systems in Action required." Five columns (top border in tone color): Deleted · Suppressed / anonymized · Retained under exception · Not found · Action required, each with count, cards (name, sub, "owner · date", exception category, reason, evidence indicator). Card click → outcome dialog.

**E5 Approval & response** (L480): Pre-closure checklist rows (icon, label, detail, Done/Open, "View"). Response template select (6 templates). "Response preview · from {client email}" (monospace-ish pre-wrap text from `respText()`). Approval card: status pill; "Closure is blocked until every checklist item is done."; Send for approval (handler); when awaiting: Approve and close / Request changes / Reject with reason, with note "{approveNote}"; approval history ("{decision} by {by} · {at} · {note}"). "Send to requester" card: "The response can be sent once the case is approved and closed." → Send response · Copy response for manual send → "Response sent and added to the evidence pack." Footer line when auto-send off: "Automatic sending is off. Every response is sent by a person."

**E6 Evidence pack** (L511): document-style preview with header (ID, client, "Draft · case open" tag when open) and 9 numbered sections: 1 Request details · 2 Identity verification · 3 SLA timeline · 4 Systems searched (table System/Owner/Result/Evidence) · 5 Actions by owner · 6 Redaction log · 7 Approvals · 8 Communications · 9 Final status. Side: "Generate evidence pack"/"Regenerate pack" · Preview PDF · Download ZIP · Share signed link; "Versions" list (vN, Draft/Final pill, time); empty "No pack generated yet. A draft can be generated at any time; the final pack is created on approval."; note "Regenerating creates a new version. Earlier versions are kept. Download links expire."

**E7 Audit log** (L544): "Audit log" / "Append-only. Entries cannot be edited or deleted." + "Export CSV". Category chips: All, Identity, Checklist, Redaction, Erasure, Approval, Evidence, Communications, SLA. Rows newest first: time · actor · action · "Reason: …" · object (mono) · meta (IP/session) · category tag.

## F. Request portal / Clients & portal (L597)
Agency title "Clients & portal" / "Northlight Privacy agency workspace", tabs **Portal setup · White-label portal · Client access**, with client chips to pick which client. Direct title "Request portal" / "How requesters see {client} on the intake form, emails and status portal", tabs **Setup · Branding**.

**Setup** (L601): left column = 4 numbered required steps + 2 optional cards; right column = Portal status card + Requester notice + Setup history.
1. **Claim your subdomain** — input + ".privacyspace.com" + "Check and claim". Helper "Names that match your verified domain ({root}) are approved instantly. Other names are checked by a person." Validation in docs/05. States: editing / in review ("Waiting for review", "Withdraw and pick another") / claimed (host, "Matches verified domain …" or "Approved after manual review", "Change" or "Locked while live").
2. **Confirm branding** — preview tile, name, hex; "Edit branding" / "Confirm branding".
3. **Set request rules** — chips for request types (Access, Erasure, Portability, Rectification, Objection, Restriction); laws (EU GDPR 30 days, UK GDPR 1 month, CCPA / CPRA 45 days); SLA note "New cases get a {n}-day deadline, the shortest that applies."; Identity check select (3 levels); "Save rules" / "Unsaved changes" / "Saved. Changes apply to new requests only."
4. **Publish the link** — URL + "Copy link"; footer snippet `<a href="https://{host}">Make a privacy request</a>` + "Copy snippet"; before live: "You can prepare this now. Confirm it once the portal is live."; "I’ve added the link" → "Link confirmed on privacy policy and footer."
- Optional **Use your own domain** — input, "Add domain" → DNS table (CNAME `{host}` → `portals.privacyspace.com`; TXT `_privacyspace.{host}` → `ps-verify={ws}-{token}`), "Verify", "DNS changes can take up to 24 hours.", Setup guide, Remove (reason).
- Optional **Send emails from your domain** — SPF TXT `v=spf1 include:mail.privacyspace.com ~all`, DKIM CNAMEs `ps1._domainkey`→`ps1.dkim.privacyspace.com`, `ps2…`; note "If you already have an SPF record, add the include to it. A domain can only have one SPF record."; status note per docs/05.
- **Portal status**: Live / Not live, status line, 4 check marks, "Go live" (enabled only when steps 1–3 done; dialog) / "Take offline" (danger, reason). Hint "Finish steps 1–3 to go live." / "Ready to go live."
- **Requester notice** (fixed, can’t be removed): "Operated by Privacyspace on behalf of {client}. {client} decides how your request is handled. Questions: {email}".
- **Setup history**: last 6 entries "text / actor · time".

**Branding / White-label portal** (L697): left settings (client chips [agency], brand color swatches, Portal domain, Email sender, Reply-to, toggle "Show “Powered by Privacyspace” footer", "Open live intake form"); right live mini-preview of the intake header + h1 + submit button + footer.

**Client access** (agency, L726): table Person · Organisation · Role · Client access (scope).

## G. Settings (L734)
Header "Settings" / "{client} workspace · changes are recorded in the workspace audit log". Tabs: Team & roles · Data sources · SLA & notifications.
- **Team & roles**: toggle "Enforce MFA for all users" / "Users without MFA are asked to set it up at next sign-in."; "Invite user"; table User (avatar, name, email) · Role · MFA pill ("MFA on"/"MFA not set up") · Last active · "Deactivate" (danger, reason). "Role permissions" matrix (docs/01).
- **Data sources**: table System (name + sub) · Owner · Search method · Evidence required · Default SLA ("Day 7") · State (switch Active/Inactive). Production needs add/edit (docs/08).
- **SLA & notifications**: "Statutory countdown" text; Reminders chips Day 1/7/14/21/28/30 (toggle); "Escalation recipients" line; "Extensions & responses" with toggles "Approver reviews extensions" and "Send final responses automatically after approval" ("Off by default. When off, a person sends every response.").
- **Billing & usage** (workspace admin only; one per org — agency sees it at org level): three cards in `repeat(auto-fit,minmax(320px,1fr))`:
  - Plan: "{Plan} plan" / "Billed monthly · renews 1 Nov 2026", Active pill, price 28px/700 + "/ month, excl. VAT", Includes ("25 DSARs / month · 3 workspaces"), Overage ("€10 per extra DSAR"), buttons Change plan (dialog with 3 plan radios; "Upgrades apply straight away and are prorated. Downgrades apply at the next renewal on 1 Nov 2026. Evidence packs are included on every plan.") and Cancel subscription (danger, reason; "Your plan stays active until 1 Nov 2026. After that, members lose access and the portal stops accepting requests. Open cases and evidence packs stay downloadable for 30 days. Tell requesters how else to reach you.").
  - Usage this period: DSARs received "13 of 25" + bar, Workspaces "1 of 3" + bar; "New requests are never blocked. DSARs over your plan are added to the next invoice. Team members are free."
  - Payment and invoicing: Payment method, Invoices sent to, Billing address, VAT ID (mono); Update payment method (opens provider's hosted page), Edit billing details.
  - Invoices table: Invoice (mono) · Period · Details · Amount · Status pill · PDF.

## H. Public intake form (Intake Form.dc.html — whole file)
Page bg `#F2F4F7`. Header (white, bottom border, 680px container): 36px brand tile with initial, company name, "Privacy request centre". Main 680px, padding 40 24 64.
- h1 "Make a data protection request"; intro "Use this form to exercise your rights under the GDPR. We will reply within one month and email you a reference number straight away."
- Error summary (after failed submit): "{n} fields need attention before you can submit."
- Card (padding 28, gap 24): request type radio cards (5, grid minmax 240) with descriptions · Full name + Email (grid) · Account identifier (type select 180px: Customer ID / Account email / Phone number / Other reference + input) with helper · Request details textarea · dashed attachments box "Attachments (optional). Do not upload identity documents unless we ask for them." + "Choose files" · consent checkbox "I agree that {company} may use the information in this form to verify my identity and handle my request." · anti-spam (replace mock with Cloudflare Turnstile / hCaptcha) · "Submit request" (brand, 48px) + "We will email a reference number and a link to verify your identity."
- Validation messages verbatim in docs/05.
- **Duplicate warning** (exists in Workspace logic, add to intake): if an open case exists for the email, show an info notice referencing the existing case on the confirmation screen after submit (at-submit, non-enumerating — see docs/08 §3).
- Success: green check circle, "We received your request", grey box Reference (mono) / Received / Response due by, 3-step list, primary "Track your request" (brand, links to the requester portal) + "Submit another request".
- Footer: "Read our privacy policy. Questions: {email}" and optional "Request handling powered by Privacyspace". Plus the requester notice (from Setup) on every public page.

## H2. Requester portal (Requester Portal.dc.html)
Same header/footer as intake (white header, brand tile + company + "Privacy request centre"; container 1040px). Signed-in header adds email + "Sign out". Footer always shows the requester notice, "For your security, you’re signed out after 30 minutes without activity." when signed in, and optional "Request handling powered by Privacyspace". Prototype prop `scenario` (progress / info / extended / done) switches the main request's state.

- **Sign in** (440px column): h1 "Track your privacy request", intro "Enter the email address you used to make your request. We’ll send you a sign-in link and a code. No password needed." Card: Email address, "Email me a sign-in link" (brand), note "For your security, we never show whether an email address has a request. If it does, the email arrives within a minute." Below: "Haven’t made a request yet? Make a data protection request". Error: "Enter a valid email address, like name@example.com."
- **Check your email**: blue mail-check circle, h1 "Check your email", "We sent a sign-in link to {email}. Open it on this device, or enter the 6-digit code from the same email." Code input (mono 22px, letter-spacing .3em, numeric, one-time-code), "Sign in", links "Send a new code" (→ "New code sent. Earlier codes no longer work.") and "Use a different email". Note "The link and code expire after 15 minutes and work once." Error "Enter the 6-digit code from the email." Same response whether or not the email has requests (no enumeration).
- **Your requests** (760px): h1 "Your requests" / "Requests made with {email}", outline "Make a new request". One card per request: reference (mono), plain title (Access → "Copy of your personal data", Rectification → "Correct your personal data", Erasure → "Delete your personal data", Portability → "Your data in a portable format", Objection → "Stop using your data"), status pill, amber "We need something from you" strip when info requested, Received + "Response due by"/"Completed" date, "View request ›".
- **Request detail** (main `flex:999 1 560px` + aside `flex:1 1 300px`):
  - Status card: h1 title, status pill, one-sentence summary, grey due box (label, date, "N days left", 4px brand progress bar).
  - **Info needed** card (amber 1.5px border `#F5B66B`): "We need one more thing to confirm it’s you" + explanation from the handler's request option; dashed upload area ("PDF, JPG or PNG, up to 10 MB. Only our privacy team can open it." + Choose file), optional note, "Send to {company}" + "This doesn’t change your response date." After sending: green status line "Document received on {date}. We’ll review it within 2 business days and email you either way."
  - **Extended** blue notice: "We need more time." + plain reason + new date + "The law allows this for complex requests. You’ll still get everything you asked for."
  - **Your documents, deleted** (completed and purged): archive icon + "We deleted the files for this request on {date}, 30 days after we closed it, as our retention policy requires. The record of what you asked for, what we did and our messages stays here." Everything else on the page remains.
  - **Your documents** (completed): redaction notice, file rows (icon, label, mono filename · size, brand Download), "Download links expire 7 days after you first open them. Your documents stay available here until {date}."
  - **Progress**: vertical 5-step timeline (28px circles, brand when done, connector line): Received → Identity confirmed / Confirming your identity → Collecting your data → Final review → Completed, each with date and one plain sentence. Rectification uses "Making the correction".
  - **Messages**: thread of outbound (left, grey) and inbound (right, white) items with sender (company / "You"), time, subject, body; "Send a message" textarea + "Send message" + "We usually reply within 2 business days. Don’t send identity documents here unless we ask."
  - Aside: Request details (Reference mono, Type, Received, due/completed, "What you asked for" quote, "Quote {id} if you contact us about this request.") and Your rights (supervisory authority sentence; authority name comes from workspace jurisdiction).
- Requester-facing status labels (map from case status): New / Verifying → "Confirming your identity" (amber when info requested) · In progress → "Collecting your data" (teal) · Extended → "Extended" (info) · Awaiting approval → "Final review" (info) · Completed → "Completed" (ok) · Rejected → "Closed" (gray, with the documented reason and complaint right).
- Never show internal notes, system names, staff names, risk level or audit data.

## I. Admin console (Privacyspace Admin.dc.html)
Same shell; sidebar adds yellow "ADMIN" badge and caption "Service console for Privacyspace staff. Every action here is logged." Nav: Overview · Organizations · Billing & revenue (overdue invoice count, red badge) · Subdomain reviews (pending count) · Domains & email (failing count, red badge `#B42318`) · Support access (pending count) · Staff · Platform policies · Staff audit log. Role switch Admin/Support/Billing (3 columns).

- **Overview** (L58): "Overview" / "All organizations on Privacyspace · 13 Oct 2026". 5 KPIs (Organizations "1 agency · 1 on trial", Workspaces, Live portals "N not live yet", Open requests "Counts only. Contents stay private.", Monthly recurring revenue "€79 at risk · 1 overdue"). "Needs attention" / "Items waiting on Privacyspace staff, oldest first." (subdomain reviews, failing/waiting domains, failed payments, orgs without MFA) — each row navigates. "Service status" list with dots + "Data region: EU (Frankfurt). Request contents are encrypted per workspace. Staff see metadata only unless a customer grants access."
- **Organizations** (L81): list + detail (grid). Search + chips All/Agency/Direct/Needs attention. Table Organization · Plan · Workspaces · Portals ("N of M live") · MFA (Required/Optional) · Status (Active / Trial · ends {date} / Suspended). Detail: name, "kind · since · region", status, note box (suspension reason red / trial info blue), Owner, Seats, Open requests "(count only)", MFA text, **Billing** line ("€499 / month · next invoice 1 Nov 2026" / "Trial · no payment method" / "Past due · €79 unpaid") + "View billing" link to that subscription, Workspaces (name, host mono, portal pill), Plan select + "Change plan", support access block (active: "Open {ws} · support view, {left}"; pending: "Support access requested. Waiting for {admin} to approve."; else "Request support access"), "Require MFA for all members", "Suspend organization"/"Reactivate organization". Support role sees "Plan, MFA and suspension changes need a Platform admin."
- **Billing & revenue**: h1 "Billing & revenue" / "Subscriptions, payments and invoices for every organization. Amounts in EUR, excluding VAT." + "Export CSV" (logged). Tabs: Revenue · Subscriptions · Payments · Invoices (overdue badge) · Plans & prices. Read-only note for Support.
  - **Revenue**: 4 KPIs — Monthly recurring revenue ("€1,063" / "4 paying organizations · ARR €12,754"), Received in October ("€738" / "2 payments · to 13 Oct"), Outstanding (red when > 0, "1 overdue invoice"), On trial ("Corvid Travel · ends 21 Oct"). "Cash received by month" bar chart (6 months, 200px tall, teal bars with value labels; current month light teal with dashed border and "(to date)"; note "June includes Halden Bikes’ annual renewal (€1,990)."; `role=img` with full text alternative). "MRR by plan" (Agency/Growth/Starter rows with paying count, amount, 6px bar; "Annual plans count as one twelfth per month. Trials and past-due subscriptions are excluded."). "Needs attention" / "Failed payments, trials ending and usage over plan." sorted failed → trial → over-usage; each opens the subscription. Empty: "Every subscription is paid and within its plan."
  - **Subscriptions**: table Organization (+kind) · Plan · Billing (Monthly/Annual) · MRR (right-aligned, "—" for trial/past due) · DSARs this period (amber 600 when over) · Next invoice ("Held" when past due) · Status (Active ok / Trial info / Past due bad / "Cancels {date}" warn). Detail panel: name, "{plan} plan · {cycle} · since {date}", status, note box, Price, Payment method, Current period, Next invoice (amount incl. overage, minus credit), Credit balance, usage bar (amber when over) with overage line ("6 over × €10 = €60, added to the next invoice"), last 4 invoices, actions: Retry payment (past due) · Extend trial (trial; options 7/14 days) · Apply credit (€25/€50/€100; "Reason shown on the invoice") · Change plan in Organizations · Cancel at period end (danger) / Resume subscription.
  - **Payments**: chips All/Succeeded/Failed/Refunds. Table Date · Organization (+note, red for failures) · Invoice (mono) · Method · Amount (right; refunds as "−€20"; failed greyed) · Status (Succeeded / Failed / Refund / Refunded) · Refund action. Footer totals: Received · Refunded · Net · Failed attempts.
  - **Invoices**: chips All/Upcoming/Overdue/Paid/Void. Table Invoice · Organization (+note) · Period · Due ("Issues {date}" for upcoming) · Amount · Status ("Paid 1 Oct" / Overdue / Upcoming / Void) · PDF, Send reminder, Void (overdue).
  - **Plans & prices**: 3 cards (Starter €79 / €790, 5 DSARs, 1 workspace, €15 overage; Growth €199 / €1,990, 25, 3 workspaces, €10; Agency €499 / €4,990, 100, 15 client workspaces, €8) with org counts; note "Evidence packs are included on every plan. Overage is billed at the end of each period and never blocks new requests. Trials last 14 days with one sample request. Prices change in the payment provider and apply to new subscriptions only."
- **Subdomain reviews** (L140): cards per claim: host (mono), "{org} · requested by {by} · {at}", pill Waiting/Flagged/Approved/Rejected, Verified domain, Customer’s note, red flag text if any, buttons Approve name · Reject · Reject and reserve; decided cards show decision line. "Reserved names" chip list (× to remove) + add input + "Add"; Support sees "Only a Platform admin can change reserved names."
- **Domains & email** (L161): table Domain (mono + issue in red/amber) · Used for · Workspace · Status · Last check · actions Re-check DNS / Email owner (not-ok rows).
- **Support access** (L178): intro "Staff can only open a customer workspace after the customer’s owner approves. Access is time-limited and shown in the customer’s own audit log." Table Workspace (+org) · Staff member · Scope · Reason · Status (+detail) · actions (pending: "Simulate customer approval" [prototype only]; active: "End access now"). Footer hint "To request access, open the organization and choose Request support access."
- **Staff** (L196): "Privacyspace employees with console access. MFA with a security key is required." + "Invite staff". Table Name · Role (select; locked for self/non-admin) · Security key pill · Last active · Remove.
- **Platform policies** (L212): "Defaults for every organization. Customers can be stricter, never looser." 5 policy rows with selects (MFA, Delete closed cases after, Longest support access, Suspend for non-payment [3/7/14 days after final attempt], Fallback sender). Changing opens a reason dialog "{old} → {new}. Applies to every organization from now on."
- **Staff audit log** (L223): "Every console action, with who did it and why. Entries can’t be edited or deleted." Export CSV; chips All/Organizations/Subdomains/Domains/Access/Staff/Policy.
- Admin dialog: same as workspace but reason label default "Reason (required, saved in the audit log)", placeholder "Why are you doing this?", error "Add a reason of at least 5 characters. It’s saved in the staff audit log." Optional radio options ("Choose an option." error). Escape closes.

## Direct vs Agency differences (one codebase)
| Area | Direct | Agency |
|---|---|---|
| Sidebar | static "Workspace" block | client switcher |
| Nav 1 | Dashboard | Agency dashboard |
| Nav 4 | Request portal (globe) | Clients & portal (building-2) |
| Dashboard | KPIs + Needs attention (this workspace) | KPIs across clients + Client workspaces table |
| Portal tabs | Setup · Branding | Portal setup · White-label portal · Client access |
| Admin persona | Sara Lind, Workspace admin | Mara Voss, Workspace admin (agency) |
| Escalation | Daniel Okafor · Sara Lind | Daniel Okafor · Mara Voss |
| Bulk-assign options | Priya Shah, Ravi Menon, Daniel Okafor | Priya Shah, Mara Voss, Daniel Okafor |
