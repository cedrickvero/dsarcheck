/**
 * Public intake: validate a form submission and record the case (docs/03 § H, Intake Form).
 *
 * Unauthenticated: the tenant is the resolved portal (from the Host), never a body field.
 * The case is created in ONE withTenant transaction via createCase (number allocation +
 * insert + "Request received via intake form" audit, actor "System"). The statutory deadline
 * is the EU GDPR 30-day default; per-workspace request rules (docs/03 § F.3) are a later slice.
 */
import { and, desc, notInArray } from "drizzle-orm";
import { createCase, type RequestType } from "@/server/cases/create";
import { withTenant, type Transaction } from "@/db/client";
import { caseFiles, cases } from "@/db/schema";
import { ValidationError } from "@/server/http/errors";
import { logError } from "@/server/log";
import type { ResolvedPortal } from "./resolve";
import { issueConfirmationLink, requesterEmailMatches } from "./requester";
import { storeIntakeAttachments, validateAttachments, type IntakeFile, type PutObject } from "./attachments";

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

/**
 * The duplicate-open-case warning (docs/08 G14, at-submit): an open case already exists
 * for this email. Case-insensitive, tenant-scoped by the surrounding withTenant (RLS), and
 * run inside the submit transaction so it is never a live enumeration oracle — its only
 * caller is the requester's own submission.
 */
export async function findOpenDuplicateCase(tx: Transaction, email: string): Promise<string | null> {
  const [row] = await tx
    .select({ caseNumber: cases.caseNumber })
    .from(cases)
    .where(and(requesterEmailMatches(email), notInArray(cases.status, ["Completed", "Rejected"])))
    .orderBy(desc(cases.createdAt))
    .limit(1);
  return row?.caseNumber ?? null;
}

export interface SubmitIntakeResult {
  caseNumber: string;
  receivedAt: Date;
  statutoryDueAt: Date;
  email: string;
  confirmUrl: string;
  /** Present when an open case already existed for this email (the G14 warning). */
  duplicateCaseNumber: string | null;
}

export async function submitIntake(
  portal: ResolvedPortal,
  input: IntakeInput,
  origin: string,
  files: IntakeFile[] = [],
  putObject?: PutObject,
): Promise<SubmitIntakeResult> {
  const errors = validateIntake(input);
  if (Object.keys(errors).length > 0) throw new ValidationError("Some fields need attention before you can submit.");

  const type = INTAKE_TYPES.find((t) => t.value === input.type);
  if (!type) throw new ValidationError("Unknown request type.");

  const fileError = validateAttachments(files);
  if (fileError) throw new ValidationError(fileError);

  // The identifier kind is whitelisted to the form's four <select> options; a value outside
  // them falls back to "Customer ID" rather than being stored verbatim.
  const identKind = (IDENT_KINDS as readonly string[]).includes(input.identKind) ? input.identKind : "Customer ID";

  const receivedAt = new Date();
  const statutoryDueAt = new Date(receivedAt.getTime() + 30 * 86_400_000); // EU GDPR 30 days
  const email = input.email.trim();

  // Create the case AND mint its email-confirmation link (G2) in one transaction, so a
  // case never exists without a way for its requester to confirm the address. The duplicate
  // check runs first in the same transaction (it must see the world BEFORE this case exists).
  const { caseNumber, caseId, confirmUrl, duplicateCaseNumber } = await withTenant(
    { orgId: portal.orgId, workspaceId: portal.workspaceId, actorId: "system" },
    async (tx) => {
      const duplicateCaseNumber = await findOpenDuplicateCase(tx, email);
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
      return { caseNumber: created.caseNumber, caseId: created.id, confirmUrl: url, duplicateCaseNumber };
    },
  );

  // Store attachments AFTER the case exists (the key references the case id). Best-effort:
  // a storage failure must not lose an already-recorded case — the file is skipped and
  // logged, and the case still succeeds.
  if (files.length > 0) {
    let stored: Awaited<ReturnType<typeof storeIntakeAttachments>>;
    try {
      stored = await storeIntakeAttachments(portal.workspaceId, caseId, files, putObject);
    } catch (err) {
      logError("intake-attachment-storage-failed", err, { caseNumber, count: files.length });
      stored = [];
    }
    if (stored.length > 0) {
      await withTenant(
        { orgId: portal.orgId, workspaceId: portal.workspaceId, actorId: "system" },
        async (tx) => {
          await tx.insert(caseFiles).values(
            stored.map((f) => ({
              orgId: portal.orgId,
              workspaceId: portal.workspaceId,
              caseId,
              name: f.name,
              type: f.type,
              sizeBytes: f.sizeBytes,
              storageKey: f.storageKey,
              sha256: f.sha256,
              version: 1,
              isEvidence: false,
            })),
          );
        },
      );
    }
  }

  return { caseNumber, receivedAt, statutoryDueAt, email, confirmUrl, duplicateCaseNumber };
}
