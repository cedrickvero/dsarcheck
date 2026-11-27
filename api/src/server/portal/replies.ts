/**
 * G18 — requester replies in the workspace (docs/05 § Requester portal).
 *
 * A signed-in requester can (a) send a message, stored as an Inbound/Portal Communication,
 * and (b) upload the document answering the handler's "Request more information", stored as
 * a `requester_upload` case file that clears `infoRequested`. Both write a "Requester …"
 * audit event (actor "{Name} (requester)") that the Handler notification derives from.
 * The caller (the route) resolves the case by case number AND the requester's email under
 * the tenant, so the id handed here is already email- and tenant-scoped.
 */
import { and, desc, eq } from "drizzle-orm";
import { auditEvents, caseFiles, cases, communications } from "@/db/schema";
import { withTenant, type Transaction } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";
import { ValidationError } from "@/server/http/errors";
import type { ResolvedPortal } from "./resolve";
import {
  storeIntakeAttachments,
  validateAttachments,
  type IntakeFile,
  type PutObject,
  type StoredAttachment,
} from "./attachments";

export interface RequesterMessage {
  id: string;
  direction: "Inbound" | "Outbound";
  subject: string;
  body: string;
  at: Date;
}

/** The two requester-initiated audit actions the Handler notification derives from. */
export const REQUESTER_REPLY_ACTIONS = ["Requester replied", "Requester uploaded"] as const;

/** A message body must be bounded: it is stored and rendered verbatim. */
export const MAX_MESSAGE_LENGTH = 2000;

/** The case's message thread, requester-safe (no internal fields exist on these rows). */
export async function listRequesterCommunications(tx: Transaction, caseId: string): Promise<RequesterMessage[]> {
  const rows = await tx
    .select({
      id: communications.id,
      direction: communications.direction,
      subject: communications.subject,
      body: communications.body,
      at: communications.at,
    })
    .from(communications)
    .where(eq(communications.caseId, caseId))
    .orderBy(desc(communications.at));
  return rows.map((r) => ({ id: r.id, direction: r.direction, subject: r.subject, body: r.body, at: r.at }));
}

/** The explanation the handler attached to "Request more information", if any. */
export async function getRequesterInfoOption(tx: Transaction, caseId: string): Promise<string | null> {
  const [event] = await tx
    .select({ meta: auditEvents.meta })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.objectType, "case"),
        eq(auditEvents.objectId, caseId),
        eq(auditEvents.action, "More information requested"),
      ),
    )
    .orderBy(desc(auditEvents.at))
    .limit(1);
  return (event?.meta?.infoOption as string) ?? null;
}

/** Record an inbound requester message + its audit event, in one transaction. */
export async function sendRequesterMessage(
  portal: ResolvedPortal,
  caseId: string,
  requesterName: string,
  body: string,
): Promise<{ id: string }> {
  const text = body.trim();
  if (!text) throw new ValidationError("a message is required");
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
  }

  return withTenant({ orgId: portal.orgId, workspaceId: portal.workspaceId, actorId: "requester" }, async (tx) => {
    const [row] = await tx
      .insert(communications)
      .values({
        orgId: portal.orgId,
        workspaceId: portal.workspaceId,
        caseId,
        direction: "Inbound",
        channel: "Portal",
        subject: "",
        body: text,
      })
      .returning({ id: communications.id });

    await writeAuditEvent(tx, {
      orgId: portal.orgId,
      workspaceId: portal.workspaceId,
      actorId: "requester",
      actorLabel: `${requesterName} (requester)`,
      action: "Requester replied",
      category: "Communications",
      reason: "Requester replied",
      objectType: "case",
      objectId: caseId,
      meta: { channel: "Portal" },
    });

    return { id: row!.id };
  });
}

export interface SubmitRequesterInfoInput {
  /** A file and/or a note; at least one is required. */
  file?: IntakeFile | null;
  note?: string;
}

/** Store the info-request answer, clear `infoRequested`, and audit — in one transaction. */
export async function submitRequesterInfo(
  portal: ResolvedPortal,
  caseId: string,
  requesterName: string,
  input: SubmitRequesterInfoInput,
  putObject?: PutObject,
): Promise<{ fileId: string | null }> {
  const note = (input.note ?? "").trim();
  const file = input.file ?? null;
  // The prototype's sendInfo requires a file; a note alone must not clear infoRequested.
  if (!file) throw new ValidationError("Choose a file before sending.");

  if (file) {
    const fileError = validateAttachments([{ name: file.name, type: file.type, size: file.size }]);
    if (fileError) throw new ValidationError(fileError);
  }

  // Store the file BEFORE the transaction: the DB row must reference a real object. A
  // storage failure rejects the submission so the requester can retry (unlike intake, where
  // attachments are optional — here the file IS the answer the handler is waiting for).
  let stored: StoredAttachment | null = null;
  if (file) {
    stored = (await storeIntakeAttachments(portal.workspaceId, caseId, [file], putObject))[0] ?? null;
  }

  return withTenant({ orgId: portal.orgId, workspaceId: portal.workspaceId, actorId: "requester" }, async (tx) => {
    let fileId: string | null = null;
    if (stored) {
      const [row] = await tx
        .insert(caseFiles)
        .values({
          orgId: portal.orgId,
          workspaceId: portal.workspaceId,
          caseId,
          sourceKey: "requester_upload",
          name: stored.name,
          type: stored.type,
          sizeBytes: stored.sizeBytes,
          storageKey: stored.storageKey,
          sha256: stored.sha256,
          version: 1,
          isEvidence: false,
        })
        .returning({ id: caseFiles.id });
      fileId = row!.id;
    }

    await tx
      .update(cases)
      .set({ infoRequested: false })
      .where(and(eq(cases.id, caseId), eq(cases.workspaceId, portal.workspaceId)));

    await writeAuditEvent(tx, {
      orgId: portal.orgId,
      workspaceId: portal.workspaceId,
      actorId: "requester",
      actorLabel: `${requesterName} (requester)`,
      action: "Requester uploaded",
      category: "Communications",
      reason: `Requester uploaded ${stored ? stored.name : "a note"}`,
      objectType: "case",
      objectId: caseId,
      meta: { fileName: stored?.name ?? null, note: note || null },
    });

    return { fileId };
  });
}
