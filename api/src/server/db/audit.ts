/**
 * The one place an audit row is written.
 *
 * Extracted from mutate() so that audit-only events (file URL issuance, file access
 * attempts) go through the SAME writer as mutation audits. Without this there would
 * be two insert paths into audit_events, and the non-mutating one would be the one
 * that drifts.
 *
 * Must be called with a transaction that has the tenant GUC set (i.e. inside
 * withTenant), so RLS applies to the insert as well.
 */
import type { Transaction } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { ValidationError } from "@/server/http/errors";

export interface AuditEventInput {
  orgId: string;
  workspaceId: string;
  actorId: string;
  actorLabel: string;
  /** Verb, e.g. "file.url.issued" or "file.accessed". */
  action: string;
  /** Grouping, e.g. "file" or "case". */
  category: string;
  /** Human-entered reason. Required: the DB CHECK rejects blank attribution. */
  reason: string;
  objectType: string;
  objectId?: string | null;
  /** Structured detail (object key, purpose, operation, expiry, exception name). */
  meta?: Record<string, unknown>;
}

export async function writeAuditEvent(tx: Transaction, event: AuditEventInput): Promise<void> {
  const reason = event.reason?.trim() ?? "";
  if (reason.length < 3) {
    throw new ValidationError("a reason is required for this audit event");
  }
  await tx.insert(auditEvents).values({
    orgId: event.orgId,
    workspaceId: event.workspaceId,
    actorId: event.actorId,
    actorLabel: event.actorLabel,
    action: event.action,
    category: event.category,
    reason,
    objectType: event.objectType,
    objectId: event.objectId ?? null,
    meta: event.meta ?? { actor: "System" },
  });
}
