/**
 * Public intake: validate a form submission and record the case (docs/03 § H, Intake Form).
 *
 * Unauthenticated: the tenant is the resolved portal (from the Host), never a body field.
 * The case is created in ONE withTenant transaction via createCase (number allocation +
 * insert + "Request received via intake form" audit, actor "System"). The statutory deadline
 * is the EU GDPR 30-day default; per-workspace request rules (docs/03 § F.3) are a later slice.
 */
import { createCase, type RequestType } from "@/server/cases/create";
import { withTenant } from "@/db/client";
import { ValidationError } from "@/server/http/errors";
import type { ResolvedPortal } from "./resolve";
import { issueConfirmationLink } from "./requester";

export interface IntakeType {
  value: RequestType;
  label: string;
  desc: string;
}

/** Verbatim from Intake Form.dc.html (TYPES). */
export const INTAKE_TYPES: IntakeType[] = [
  { value: "Access", label: "Access", desc: "Get a copy of the personal data we hold about you." },
  { value: "Rectification", label: "Rectification", desc: "Correct inaccurate or incomplete data." },
  { value: "Erasure", label: "Erasure", desc: "Ask us to delete your personal data." },
  { value: "Portability", label: "Portability", desc: "Receive your data in a machine-readable format." },
  { value: "Objection", label: "Objection", desc: "Object to how we use your data." },
];

export const IDENT_KINDS = ["Customer ID", "Account email", "Phone number", "Other reference"] as const;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface IntakeInput {
  type: string;
  name: string;
  email: string;
  identKind: string;
  ident: string;
  details: string;
  consent: string;
  human: string;
}

/** Field-level errors, verbatim from the prototype's submit(). */
export function validateIntake(input: IntakeInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (!input.name.trim()) e.name = "Enter your full name.";
  if (!EMAIL_RE.test(input.email.trim())) e.email = "Enter a valid email address, like name@example.com.";
  if (!input.ident.trim()) e.ident = "Enter an identifier so we can find your account.";
  if (!input.details.trim()) e.details = "Describe your request.";
  if (input.consent !== "on") e.consent = "You must agree before we can process your request.";
  if (input.human !== "on") e.human = "Complete the anti-spam check.";
  return e;
}

export async function submitIntake(
  portal: ResolvedPortal,
  input: IntakeInput,
  origin: string,
): Promise<{ caseNumber: string; receivedAt: Date; statutoryDueAt: Date; email: string; confirmUrl: string }> {
  const errors = validateIntake(input);
  if (Object.keys(errors).length > 0) throw new ValidationError("Some fields need attention before you can submit.");

  const type = INTAKE_TYPES.find((t) => t.value === input.type);
  if (!type) throw new ValidationError("Unknown request type.");

  // The identifier kind is whitelisted to the form's four <select> options; a value outside
  // them falls back to "Customer ID" rather than being stored verbatim.
  const identKind = (IDENT_KINDS as readonly string[]).includes(input.identKind) ? input.identKind : "Customer ID";

  const receivedAt = new Date();
  const statutoryDueAt = new Date(receivedAt.getTime() + 30 * 86_400_000); // EU GDPR 30 days
  const email = input.email.trim();

  // Create the case AND mint its email-confirmation link (G2) in one transaction, so a
  // case never exists without a way for its requester to confirm the address.
  const { caseNumber, confirmUrl } = await withTenant(
    { orgId: portal.orgId, workspaceId: portal.workspaceId, actorId: "system" },
    async (tx) => {
      const created = await createCase(tx, {
        orgId: portal.orgId,
        workspaceId: portal.workspaceId,
        actorId: "system",
        actorLabel: "System",
        requestType: type.value,
        receivedAt,
        statutoryDueAt,
        requesterName: input.name.trim(),
        requesterEmail: email,
        identifier: `${identKind} ${input.ident.trim()}`,
        details: input.details.trim(),
      });
      const { url } = await issueConfirmationLink(tx, portal, created.id, email, origin);
      return { caseNumber: created.caseNumber, confirmUrl: url };
    },
  );

  return { caseNumber, receivedAt, statutoryDueAt, email, confirmUrl };
}
