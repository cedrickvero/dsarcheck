/**
 * Response text and the header call to action — ported verbatim from `respText()`
 * in `design/reference/seed/workspace-seed.js` and the `cta` block of
 * `cockpit()` in `design/reference/logic/workspace-logic.js` (docs/05 § Response,
 * § Primary CTA by status).
 *
 * The strings are final copy. Never introduce "guaranteed compliance",
 * "automatic legal determination" or "AI-approved"; the refusal and erasure
 * templates carry the legal wording the product is allowed to use.
 */
import { formatDate } from "./dates";
import { remainingLabel } from "./checks";
import type { CaseStatus, ErasureOutcome, Risk, Tone } from "./types";

export interface RespTextCase {
  id: string;
  name: string;
  type: string;
  receivedAt: Date;
  template?: string | null;
  systems: { key: string; outcome?: ErasureOutcome | null }[];
}

export interface RespTextClient {
  /** The workspace sender name, e.g. "Lumen Analytics Privacy". */
  sender: string;
}

export interface RespTextSource {
  key: string;
  name: string;
}

const OUTCOME_GROUPS: { label: string; outcome: ErasureOutcome }[] = [
  { label: "Deleted", outcome: "Deleted" },
  { label: "Anonymized", outcome: "Suppressed / anonymized" },
  { label: "Retained under legal obligation", outcome: "Retained under exception" },
  { label: "No data found", outcome: "Not found" },
];

export function respText(
  caseLike: RespTextCase,
  client: RespTextClient,
  sources: RespTextSource[],
): string {
  const firstName = caseLike.name.split(" ")[0];
  const received = formatDate(caseLike.receivedAt);
  const sign = `\n\n${client.sender}`;
  const template = caseLike.template ?? "";

  if (template.startsWith("Erasure")) {
    const nameFor = new Map(sources.map((s) => [s.key, s.name] as const));
    const lines = OUTCOME_GROUPS.map((group) => {
      const names = caseLike.systems
        .filter((s) => s.outcome === group.outcome)
        .map((s) => nameFor.get(s.key) ?? s.key)
        .join(", ");
      return names ? `• ${group.label}: ${names}` : null;
    })
      .filter((line): line is string => line !== null)
      .join("\n");

    return (
      `Dear ${firstName},\n\nWe have completed your erasure request received on ` +
      `${received} (reference ${caseLike.id}).\n\nThe outcome in each system we ` +
      `checked:\n${lines}\n\nWhere we keep data under a legal obligation, we keep ` +
      `only what that obligation requires and delete it when the retention period ` +
      `ends.\n\nIf you have questions, reply to this email quoting ${caseLike.id}.` +
      sign
    );
  }

  if (template.startsWith("Refusal")) {
    return (
      `Dear ${firstName},\n\nWe are unable to complete your request received on ` +
      `${received} (reference ${caseLike.id}) for the reason set out below.\n\n` +
      `[Documented reason]\n\nYou have the right to complain to a supervisory ` +
      `authority.${sign}`
    );
  }

  if (!template) return "Select a response template to preview the message.";

  return (
    `Dear ${firstName},\n\nWe have completed your ` +
    `${caseLike.type.toLowerCase()} request received on ${received} ` +
    `(reference ${caseLike.id}).\n\nWe searched ${caseLike.systems.length} systems ` +
    `where your data may be held. Your documents are available in your secure ` +
    `request portal. The download link expires 7 days after it is first opened.` +
    `\n\nSome information has been removed because it relates to other people or ` +
    `contains confidential internal notes.\n\nIf you have questions, reply to this ` +
    `email quoting ${caseLike.id}.` +
    sign
  );
}

// ── Primary CTA ──────────────────────────────────────────────────────────────

export interface PrimaryCtaInput {
  status: CaseStatus;
  risk: Risk;
  isApprover: boolean;
  /** Number of failing pre-closure checks. */
  openCheckCount: number;
}

export interface PrimaryCta {
  label: string;
  icon: string;
  /** Target cockpit tab. */
  tab: string;
  enabled: boolean;
  /** The helper line under a disabled button, or "" when enabled. */
  note: string;
  tone: Tone;
}

/**
 * One CTA per status (docs/05). Disabled states always carry a note, and the
 * note is linked with `aria-describedby` in the UI.
 */
export function primaryCta(input: PrimaryCtaInput): PrimaryCta {
  const { status, risk, isApprover, openCheckCount } = input;

  switch (status) {
    case "New":
      return {
        label: "Start verification",
        icon: "shield",
        tab: "identity",
        enabled: true,
        note: "",
        tone: "teal",
      };

    case "Verifying": {
      const blocked = risk === "High" && !isApprover;
      return {
        label: "Approve identity",
        icon: "user-check",
        tab: "identity",
        enabled: !blocked,
        note: blocked ? "High-risk: approver role required" : "",
        tone: "teal",
      };
    }

    case "In progress":
    case "Extended": {
      const blocked = openCheckCount > 0;
      return {
        label: "Send for approval",
        icon: "send",
        tab: "approval",
        enabled: !blocked,
        note: blocked ? remainingLabel(openCheckCount) : "",
        tone: "teal",
      };
    }

    case "Awaiting approval": {
      const blocked = !isApprover || openCheckCount > 0;
      return {
        label: "Approve and close",
        icon: "lock",
        tab: "approval",
        enabled: !blocked,
        note: blocked
          ? !isApprover
            ? "Approver role required"
            : "Resolve open items first"
          : "",
        tone: "teal",
      };
    }

    default:
      // Completed / Rejected
      return {
        label: "Download evidence pack",
        icon: "download",
        tab: "evidence",
        enabled: true,
        note: "",
        tone: "teal",
      };
  }
}

/** The six response templates, verbatim from the seed. */
export const RESPONSE_TEMPLATES = [
  "Access — data copy enclosed",
  "Erasure — confirmation of outcomes",
  "Portability — machine-readable export",
  "Rectification — changes made",
  "Objection — processing stopped",
  "Refusal — documented reason",
] as const;
