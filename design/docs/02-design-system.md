# 02 · Design system

All values are taken from the prototypes. Use them as theme tokens. Nothing outside this list.

## Fonts
- UI: **IBM Plex Sans** 400/500/600/700 (650 used for page titles: use variable font or 600 if 650 unavailable)
- Mono: **IBM Plex Mono** 400/500/600: case IDs, file names, hostnames, DNS values, references
- Base: 15px / line-height 1.5, color `#101828`
- Icons: Lucide, 18px in nav, 14–16px inline, 20px in feature spots. Always `aria-hidden` with a text label nearby.

## Type scale
| Use | Size / weight | Color |
|---|---|---|
| Page title (h1) | 24px / 650, margin 0 | `#0B1F3A` |
| Page subtitle | 15px / 400, margin-top 4px | `#667085` |
| Section/card title (h2) | 18px / 600 | `#0B1F3A` |
| Card sub-heading | 15–16px / 600 | `#0B1F3A` |
| Body | 15px / 400 | `#101828` |
| Table body | 14px / 400 | `#101828` |
| Table header | 13px / 600 | `#475467` on `#F7F8FA` |
| Caption / meta | 12–13px / 500 | `#667085` |
| Eyebrow (sidebar) | 11px / 400, uppercase, letter-spacing 0.04em | `#9FB0C6` |
| Mono | 13px / 500 | `#344054` / `#0B1F3A` |
| Intake h1 | 28px / 700, line-height 1.25 | `#101828` |

Approved improvement: headings ≥ 24px get `letter-spacing: -0.01em`; 18px headings `-0.005em`.

## Colors

### Brand / neutrals
| Token | Hex | Use |
|---|---|---|
| navy-900 | `#0B1F3A` | Sidebar bg, titles, selected chip bg, toast bg |
| navy-700 | `#173A5E` | Sidebar hover + active item bg, notification button active |
| navy-600 | `#24507A` | Sidebar borders, count badges |
| sidebar-text | `#C7D2E0` | Sidebar item text |
| sidebar-muted | `#9FB0C6` | Sidebar captions |
| teal-600 | `#0E7C7B` | Primary button, active tab underline, done steps, toggle on |
| teal-700 | `#0A6463` | Primary hover; teal text on teal-100 |
| teal-500 | `#14919B` | Focus ring, active nav bar, avatar |
| teal-100 | `#D7F0EF` | Selected row bg, selected option bg |
| teal-50 | `#F5FBFB` | Unread notification bg |
| admin-select | `#F2F7F7` | Selected org row (Admin) |
| gray-25 | `#F9FAFB` | Subtle input bg |
| gray-50 | `#F7F8FA` | App background, table header, info boxes |
| gray-intake | `#F2F4F7` | Intake page bg, hover rows |
| gray-100 | `#EEF1F4` | Dividers inside cards, gray pill bg |
| border | `#E4E7EC` | Card borders |
| input-border | `#D0D5DD` | Inputs, outline buttons, unselected chips |
| gray-400 | `#98A2B3` | Radio rings, placeholder icons |
| gray-500 | `#667085` | Secondary text |
| gray-600 | `#475467` | Tertiary text, body on muted |
| gray-700 | `#344054` | Outline button text, strong secondary |
| gray-900 | `#101828` | Body |

### Semantic tones (pill bg / fg) — `T` in seed
| Tone | bg | fg |
|---|---|---|
| gray | `#EEF1F4` | `#344054` |
| info | `#D9E8FF` | `#175CD3` |
| teal | `#D7F0EF` | `#0A6463` |
| warn | `#FDF0DC` | `#B54708` |
| ok | `#D9F2E7` | `#0E6B4D` |
| bad | `#FEE4E2` | `#B42318` |

Others in use: danger button `#B42318`; unread badge `#D92D20` with 2px `#0B1F3A` ring; warning bar `#DC6803`; portal step pills done `#E6F4F1`/`#0B5F5E`, review `#FEF0C7`/`#93370D`, todo `#F2F4F7`/`#475467`; warn message box `#FFFAEB`/`#93370D`; error box `#FEF3F2`/`#B42318` (border `#F0B8B2` on intake summary); service dots ok `#12B76A`, degraded `#F79009`; admin badge `#F5C451` on `#0B1F3A`; internal-note highlight `#FFF8EB`; redaction flagged token bg `#FDF0DC` border `#DC6803`; redacted block `#0B1F3A` with white text.

### Customer brand color (white-label)
Default `#3B4CCA`. Swatches offered: `#3B4CCA`, `#0E7C7B`, `#B8432F`, `#1F2937`, `#7A3E9D`. Used only on public surfaces (intake logo tile, selected request type border/dot, submit button, checkbox accent). Selected request type bg `#F5F6FF`. Validate contrast ≥ 4.5:1 against white before accepting a custom hex.

## Status maps (icon names are Lucide)
| Case status | Tone | Icon |
|---|---|---|
| New | gray | circle-dashed |
| Verifying | info | shield |
| In progress | teal | circle-dot |
| Awaiting approval | warn | lock |
| Completed | ok | circle-check |
| Extended | info | calendar-clock |
| Rejected | bad | circle-x |

| System (checklist) status | Tone | Icon |
|---|---|---|
| Not started | gray | circle |
| In progress | teal | circle-dot |
| Completed | ok | circle-check |
| Not found | gray | search-x |
| Action required | warn | triangle-alert |
| Retained under exception | info | archive |

| Erasure outcome | Tone | Icon | → system status |
|---|---|---|---|
| Deleted | ok | trash-2 | Completed |
| Suppressed / anonymized | teal | eye-off | Completed |
| Retained under exception | info | archive | Retained under exception |
| Not found | gray | search-x | Not found |
| Action required | warn | triangle-alert | Action required |

Risk: Low ok/shield-check · Medium warn/shield-alert · High bad/shield-x.
Identifier match: Match ok/circle-check · Partial warn/circle-alert · No match bad/circle-x.
Email: Confirmed ok/mail-check · Pending gray/mail.

### SLA indicator (`sla()` in seed)
| Condition | Label | fg | bg | bar | icon | risk |
|---|---|---|---|---|---|---|
| closed | `Closed 2 Oct` | `#475467` | `#EEF1F4` | `#98A2B3` | circle-check | Closed |
| left < 0 | `Overdue by N day(s)` | `#B42318` | `#FEE4E2` | `#B42318` | circle-alert | Overdue |
| left = 0 | `Due today` | `#B54708` | `#FDF0DC` | `#B54708` | triangle-alert | Strong warning |
| 1–7 | `N day(s) left` | `#B54708` | `#FDF0DC` | `#DC6803` | clock | Due soon |
| > 7 | `N days left` | `#344054` | `#EEF1F4` | `#0E7C7B` | clock | On track / Extended |

Deadline = received + 1 month + extension months. Progress % = elapsed/total, min 4, 100 when overdue. Bar: 4px tall, radius 999, track `#EEF1F4`. Screen-reader label: "SLA {label}, {risk}".

## Spacing, radius, elevation
- 4px base. Used: 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 64.
- Page container: `max-width:1440px; margin:0 auto; padding:28px 32px 48px; gap:20px` (cockpit: top padding 20px, gap 16px).
- Sidebar: 240px fixed, sticky, full height, `padding:16px 12px; gap:16px`.
- Card: white, `1px solid #E4E7EC`, radius 12, padding 20–24.
- Radius: 4 (admin badge, captcha box), 6 (nav items, menu items), 8 (buttons, inputs, small tiles), 10 (toast, option cards, dropdown menus), 12 (cards, popovers), 16 (dialogs), 999 (pills, chips, badges).
- Shadows: dialog `0 20px 50px rgba(11,31,58,.25)`; toast `0 10px 30px rgba(11,31,58,.3)`; dropdown `0 12px 30px rgba(0,0,0,.3)`. No decorative shadows on cards.
- Overlay scrim: `rgba(11,31,58,.45)`.
- z-index: sidebar 30, notification scrim 40 / panel 41+, dialog 50, toast 60.

## Components

### Buttons (min-height 44px; radius 8; weight 600; padding 0 16–18px)
- **Primary**: bg `#0E7C7B`, white, hover `#0A6463`. One per view.
- **Secondary/outline**: white, `1px solid #D0D5DD`, text `#0B1F3A` or `#344054`.
- **Danger**: bg `#B42318` white (dialogs) or outline with `#B42318` text.
- **Disabled primary**: bg `#D0D5DD`, text `#475467`, `cursor:not-allowed`, lock icon, plus a helper line below (13px `#B54708`, info icon) linked via `aria-describedby`.
- **Compact** (table rows): min-height 36px, padding 0 12px.
- Press: `transform:scale(0.97)` 100ms ease-out; bg transition 120ms.

### Filter chips / segmented
min-height 36px, radius 999, padding 0 12–14px. Off: white / `#D0D5DD` / `#344054`. On: `#0B1F3A` bg+border, white text. `aria-pressed`. Optional count after label.

### Pill
`inline-flex; gap 6px; padding 3px 10px; radius 999; 12px/600;` icon + label, tone colors.

### Tabs
Bar: `border-bottom:1px solid #E4E7EC; padding:0 12px; gap:4px`, horizontally scrollable. Tab: min-height 48px, padding 0 12px, 14px, inactive `#667085`/500, active `#0B1F3A`/600 with `2px solid #0E7C7B` bottom border. Optional badge: `#EEF1F4`/`#344054`, 11px/600, padding 1px 7px. `role=tablist/tab/tabpanel`, `aria-selected`.

### Inputs
Height 44, `1px solid #D0D5DD`, radius 8, padding 0 12 (textarea 10px 12px, vertical resize). Error: border `#B42318` + message below (13px `#B42318`, circle-alert icon). Labels above: 14px/600, gap 6.

### Toggle switch
Track 44×24 radius 999, on `#0E7C7B` off `#D0D5DD`; knob 20px white, left 2px off / 22px on. `role=switch aria-checked`.

### Data table
Full-width, `border-collapse:collapse`, 14px. Header row `#F7F8FA`, 13px/600 `#475467`, cell padding 10px 12px (first col 20px). Rows `border-top:1px solid #EEF1F4`, height 52–60, padding 8px 12px. Selected row `#D7F0EF`. Rows are clickable and keyboard-openable (Enter). Wrap in horizontal scroll container with min-width (820–900px).

### Confirmation (reason) dialog — the core pattern
- Scrim `rgba(11,31,58,.45)`, centered, padding 24. Panel white, radius 16, max-width 520, max-height 90vh scroll.
- Header (padding 24 24 0): title 18/600 `#0B1F3A`; description 14 `#475467`.
- Body (padding 20 24, gap 16):
  - Optional **radio options** (button rows, min-height 44, `1.5px` border; selected `#D7F0EF` bg + `#0E7C7B` border and dot).
  - Optional **exception category** select ("Exception category (required)").
  - **Reason** textarea, label `{reasonLabel} (required)` or without suffix if optional; autofocus.
  - Error line `role=alert`.
  - **Audit preview box**: `#F7F8FA` bg, `1px #E4E7EC`, radius 8, 12px `#475467`, history icon: "**Audit entry** · {actor} · {timestamp} · {action}".
- Footer (padding 16 24 24, right-aligned, gap 10): Cancel (outline) + Confirm (teal or danger).
- Validation: workspace min 3 chars ("A reason is required. It is stored in the audit log."); admin min 5 chars.
- A11y: `role=dialog aria-modal`, focus trap, Escape cancels, return focus to trigger.
- Approved improvement: fade scrim 0→1 in 160ms; panel opacity 0→1 + translateY(8px→0) + scale(.98→1) 200ms `cubic-bezier(.2,.8,.2,1)`; reverse 120ms on close. Disabled under reduced motion.

### Toast (current) → Status banner (approved)
Prototype toast: fixed bottom 24 centered, `#0B1F3A`, white 14px, radius 10, padding 12 18, check icon `#5FD3C9`, auto-dismiss 4s, `role=status aria-live=polite`.
Approved change: keep toast only for trivial confirmations (copied, saved note). For compliance-critical outcomes (identity approved, approval recorded, response sent, pack generated, extension, suspension, portal live) show a **persistent inline status line** on the affected page/card ("Approval recorded by Daniel Okafor at 13 Oct 2026, 10:44") that remains until the state changes. See docs/08.

### Notification popover (workspace)
Bell button 40×40 in sidebar header; unread badge (min 20px, `#D92D20`, 11px/700, tabular nums, "9+" cap). Panel: fixed `left:244px; top:12px; width:380px`, max-height `calc(100vh - 24px)`, white, `1px #E4E7EC`, radius 12. Header "Notifications" + "For {name} · {role}" + "Mark all as read". Items: 32px tinted icon tile, title (650 if unread / 500), sub, meta `{caseId} · {sla label}`, unread bg `#F5FBFB`. Click → open case at tab, mark read. Scrim closes. Approved: Escape closes, focus returns to bell, fade/slide-in 160ms.

### Stepper (case header)
6 steps, 26px circles with 2px border; done = teal fill + check; current = white + teal border/number; future = white + `#D0D5DD` border, `#667085`. Connector 2px, teal when done. Each step is a button to its tab, `aria-label="{label}, {complete|current step|not started}"`.

### Empty states
Centered, padding 40, `#475467`, one sentence that says what happens next. Examples (verbatim): "Nothing needs attention. New requests appear here when they need a decision."

### Global CSS
```
*{box-sizing:border-box}
body{margin:0;background:#F7F8FA}
:focus-visible{outline:2px solid #14919B;outline-offset:2px}
a{color:#0E7C7B} a:hover{color:#0B1F3A}
@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
```
