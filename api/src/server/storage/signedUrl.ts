/**
 * The ONLY place a signed URL leaves the server.
 *
 * Fixed order, non-negotiable (R2 spec):
 *
 *   authorize -> validate purpose -> validate/build key -> clamp TTL
 *     -> apply SSE -> mint URL -> persist metadata + audit event in ONE transaction
 *
 * On authorization failure: no URL is minted, no metadata is persisted, and the
 * denial is itself audited. Callers never see a URL that is not on the record.
 *
 * Why minting happens before the transaction: signing is a local, pure computation
 * that reaches the network only when the URL is later used. The URL is therefore
 * only ever RETURNED after the transaction commits. If the transaction throws, the
 * function throws too and the caller never receives it, so "minted" and "recorded"
 * cannot diverge from the caller's point of view.
 */
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { withTenant } from "@/db/client";
import { objects } from "@/db/schema";
import { authorize, AuthorizationDeniedError, type PermissionSource } from "@/server/auth/authorize";
import type { Actor } from "@/server/auth/require-auth";
import { writeAuditEvent } from "@/server/db/audit";
import { env } from "@/env";
import { ValidationError } from "@/server/http/errors";
import { assertKeyInWorkspace, buildObjectKey, InvalidObjectKeyError, parseObjectKey } from "./objectKey";
import {
  assertPurpose,
  clampTtl,
  UnknownPurposeError,
  methodOf,
  parseTtlExceptions,
  requiredPermission,
  resolveTtlWithException,
  type HttpMethod,
  type Operation,
  type Purpose,
} from "./purpose";
import { getObjectCommand, putObjectCommand, s3, serverSideEncryption } from "./s3Client";

export interface IssuedUrl {
  url: string;
  method: HttpMethod;
  operation: Operation;
  purpose: Purpose;
  objectKey: string;
  ttlSeconds: number;
  expiresAt: Date;
  /** Row id in the objects table (uploads only). */
  objectId?: string;
  /** Present only when a named TTL exception was used. */
  exceptionName?: string;
}

interface CommonArgs {
  actor: Actor;
  /** Human-entered reason. Required: audited and enforced non-blank. */
  reason: string;
  requestId: string;
  permissions: PermissionSource;
  /** A hint only. Always clamped to the purpose's ceiling. */
  requestedTtlSeconds?: number;
  /** Names a configured exception. Refused unless it matches purpose AND operation. */
  exceptionName?: string;
}

export interface IssueUploadUrlArgs extends CommonArgs {
  /** Accepts unknown input on purpose: it is validated against the allowlist. */
  purpose: string;
  contentType: string;
  /** Supply to reuse a key generated earlier in the same request. */
  objectId?: string;
}

export interface IssueDownloadUrlArgs extends CommonArgs {
  /**
   * The purpose the caller believes this object is. Taken from the caller's
   * context and checked against the allowlist, so authorization happens BEFORE the
   * key is even parsed; the key is then required to agree with it.
   */
  purpose: string;
  /** The stored key. Validated, never trusted. */
  objectKey: string;
}

function resolveTtl(args: {
  purpose: Purpose;
  operation: Operation;
  requestedTtlSeconds?: number;
  exceptionName?: string;
}): { ttlSeconds: number; exceptionName?: string } {
  const ceiling = clampTtl(args.purpose, args.operation);
  const requested = args.requestedTtlSeconds ?? ceiling;

  if (args.exceptionName) {
    const { ttlSeconds, exceptionName } = resolveTtlWithException({
      exceptions: parseTtlExceptions(env.SIGNED_URL_TTL_EXCEPTIONS),
      exceptionName: args.exceptionName,
      purpose: args.purpose,
      operation: args.operation,
      requestedSeconds: requested,
    });
    return { ttlSeconds, exceptionName };
  }
  return { ttlSeconds: clampTtl(args.purpose, args.operation, requested) };
}

/**
 * A denial audit row needs the caller's reason. If the reason were invalid, writing
 * the row would throw a ValidationError and MASK the denial it was recording - so the
 * reason is validated before any work begins, not when the row is written.
 */
function hasValidReason(reason: unknown): reason is string {
  return typeof reason === "string" && reason.trim().length >= 3;
}

/** The object's uuid when the key parses, else null. Never throws. */
function tryKeyId(objectKey: string): string | null {
  try {
    return parseObjectKey(objectKey).id;
  } catch {
    return null;
  }
}

/**
 * A refusal because the caller supplied no usable reason is STILL a refusal, and the
 * product requires every refusal to be on the record. The row is written with a
 * generated reason (the supplied one is unusable by definition), then the original
 * ValidationError surfaces - so the denial is recorded and never masked.
 *
 * Guardrail NF-3: this path previously wrote zero rows, which made "every refusal is
 * audited" an overstatement.
 */
async function refuseInvalidReason(
  args: { actor: Actor; requestId: string; action: string; reason: unknown },
  error: Error,
): Promise<never> {
  await auditDenial({
    actor: args.actor,
    requestId: args.requestId,
    reason: "request refused before action: reason missing or shorter than 3 characters",
    action: args.action,
    requested: {
      denialCode: "invalid_reason",
      providedReasonLength: typeof args.reason === "string" ? args.reason.trim().length : null,
    },
    error,
  });
  // unreachable: auditDenial rethrows. Explicit so control flow is provable.
  throw error;
}

/** Writes the "denied" audit row in the actor's OWN workspace, then rethrows. */
async function auditDenial(args: {
  actor: Actor;
  requestId: string;
  reason: string;
  action: string;
  requested: Record<string, unknown>;
  /** Correlates the refusal to an object when one can be identified (guardrail NF-2). */
  objectId?: string | null;
  error: Error;
}): Promise<never> {
  await withTenant(
    { orgId: args.actor.orgId, workspaceId: args.actor.workspaceId, actorId: args.actor.userId },
    async (tx) => {
      await writeAuditEvent(tx, {
        orgId: args.actor.orgId,
        workspaceId: args.actor.workspaceId,
        actorId: args.actor.userId,
        actorLabel: args.actor.label,
        action: args.action,
        category: "file",
        reason: args.reason,
        objectType: "object",
        objectId: args.objectId ?? null,
        meta: {
          outcome: "denied",
          requestId: args.requestId,
          deniedBy: args.error.name,
          detail: args.error.message,
          ...args.requested,
        },
      });
    },
  );
  throw args.error;
}

/**
 * Audits a refusal raised by any step of the fixed order, then rethrows it.
 *
 * EVERY refusal must go through here. The guardrail found three refusals that threw
 * outside an audited wrapper - a purpose/key mismatch, an unusable TTL exception and
 * recordFileAccess' tenant check - so "every denial is audited" was false. A refusal
 * that is not on the record is the exact failure the audit trail exists to prevent.
 */
async function auditRefusal(
  args: { actor: Actor; requestId: string; reason: string; action: string },
  denialCode: string,
  error: unknown,
  requested: Record<string, unknown>,
  objectId: string | null = null,
): Promise<never> {
  const err = error instanceof Error ? error : new Error(String(error));
  return auditDenial({
    actor: args.actor,
    requestId: args.requestId,
    reason: args.reason,
    action: args.action,
    requested: { denialCode, ...requested },
    objectId,
    error: err,
  });
}

/**
 * Steps 1+2 of the fixed order for both operations: resolve the requested purpose
 * against the server-side allowlist, then authorize that exact
 * purpose/operation. Returns the purpose, or throws - auditing a denial first.
 */
async function resolvePurposeAndAuthorize(args: {
  actor: Actor;
  requestedPurpose: unknown;
  operation: Operation;
  permissions: PermissionSource;
  requestId: string;
  reason: string;
  action: string;
  extra: Record<string, unknown>;
}): Promise<Purpose> {
  try {
    const purpose = assertPurpose(args.requestedPurpose);
    await authorize({
      actor: args.actor,
      workspaceId: args.actor.workspaceId,
      permission: requiredPermission(purpose, args.operation),
      source: args.permissions,
    });
    return purpose;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    // An unknown/user-controlled purpose and an authorization refusal are BOTH
    // denials and must both be on the record.
    const denialCode =
      err instanceof AuthorizationDeniedError
        ? "authorization_denied"
        : err instanceof UnknownPurposeError
          ? "unknown_purpose"
          : "invalid_purpose";
    await auditDenial({
      actor: args.actor,
      requestId: args.requestId,
      reason: args.reason,
      action: args.action,
      requested: { purpose: args.requestedPurpose, denialCode, ...args.extra },
      error: err,
    });
    // unreachable: auditDenial rethrows. Explicit so control flow is provable.
    throw err;
  }
}

export async function issueUploadUrl(args: IssueUploadUrlArgs): Promise<IssuedUrl> {
  if (!hasValidReason(args.reason)) {
    return await refuseInvalidReason(
      { actor: args.actor, requestId: args.requestId, action: "file.upload_url.issued", reason: args.reason },
      new ValidationError("a reason of at least 3 characters is required for this action"),
    );
  }
  const operation: Operation = "upload";
  const action = "file.upload_url.issued";

  // 1. authorize -> 2. validate purpose (shared helper, denial audited)
  const purpose = await resolvePurposeAndAuthorize({
    actor: args.actor,
    requestedPurpose: args.purpose,
    operation,
    permissions: args.permissions,
    requestId: args.requestId,
    reason: args.reason,
    action,
    extra: { contentType: args.contentType },
  });

  // 3. build the key server-side, in the actor's workspace
  let objectKey: string;
  try {
    objectKey = buildObjectKey({
      workspaceId: args.actor.workspaceId,
      purpose,
      id: args.objectId,
    });
    assertKeyInWorkspace(objectKey, args.actor.workspaceId);
  } catch (error) {
    return await auditRefusal(
      { actor: args.actor, requestId: args.requestId, reason: args.reason, action: "file.upload_url.issued" },
      "invalid_object_key",
      error,
      { requestedObjectId: args.objectId ?? null },
      null,
    );
  }
  // F-3: object_id must mean the SAME thing on every event. Downloads can only
  // know the key's uuid, so uploads record that too, with the row id kept beside it.
  const keyId = parseObjectKey(objectKey).id;

  // 4. clamp the TTL - a refused exception is a denial and must be on the record
  let ttl: { ttlSeconds: number; exceptionName?: string };
  try {
    ttl = resolveTtl({
      purpose,
      operation,
      requestedTtlSeconds: args.requestedTtlSeconds,
      exceptionName: args.exceptionName,
    });
  } catch (error) {
    return await auditRefusal(
      { actor: args.actor, requestId: args.requestId, reason: args.reason, action: "file.upload_url.issued" },
      args.exceptionName ? "invalid_ttl_exception" : "invalid_ttl",
      error,
      { purpose, operation, requestedTtlSeconds: args.requestedTtlSeconds ?? null, exceptionName: args.exceptionName ?? null },
      tryKeyId(objectKey),
    );
  }
  const { ttlSeconds, exceptionName } = ttl;

  // 5. SSE + mint. The algorithm comes from configuration only - the caller passes
  //    no encryption parameter, and because the SSE headers are part of the
  //    signature an uploader cannot substitute its own.
  const sse = serverSideEncryption();
  const url = await getSignedUrl(s3, putObjectCommand(objectKey, args.contentType), {
    expiresIn: ttlSeconds,
  });
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  // 6. persist metadata + audit together
  const insertedId = await withTenant(
    { orgId: args.actor.orgId, workspaceId: args.actor.workspaceId, actorId: args.actor.userId },
    async (tx) => {
      const [row] = await tx
        .insert(objects)
        .values({
          orgId: args.actor.orgId,
          workspaceId: args.actor.workspaceId,
          objectKey,
          purpose,
          contentType: args.contentType,
          uploaderActorId: args.actor.userId,
        })
        .returning({ id: objects.id });

      await writeAuditEvent(tx, {
        orgId: args.actor.orgId,
        workspaceId: args.actor.workspaceId,
        actorId: args.actor.userId,
        actorLabel: args.actor.label,
        action,
        category: "file",
        reason: args.reason,
        objectType: "object",
        objectId: keyId,
        meta: {
          requestId: args.requestId,
          objectRowId: row?.id ?? null,
          objectKey,
          purpose,
          operation,
          method: methodOf(operation),
          expiresAt: expiresAt.toISOString(),
          ttlSeconds,
          // The algorithm actually applied, and a reference to the key - never key material.
          sse: {
            algorithm: sse.ServerSideEncryption,
            keyIdRef: sse.ServerSideEncryption === "aws:kms" ? sse.SSEKMSKeyId : null,
          },
          ...(exceptionName ? { exceptionName } : {}),
        },
      });
      return row?.id;
    },
  );

  return {
    url,
    method: methodOf(operation),
    operation,
    purpose,
    objectKey,
    ttlSeconds,
    expiresAt,
    ...(exceptionName ? { exceptionName } : {}),
    ...(insertedId ? { objectId: insertedId } : {}),
  };
}

export async function issueDownloadUrl(args: IssueDownloadUrlArgs): Promise<IssuedUrl> {
  if (!hasValidReason(args.reason)) {
    return await refuseInvalidReason(
      { actor: args.actor, requestId: args.requestId, action: "file.download_url.issued", reason: args.reason },
      new ValidationError("a reason of at least 3 characters is required for this action"),
    );
  }
  const operation: Operation = "download";
  const action = "file.download_url.issued";

  // 1. authorize -> 2. validate purpose. Both use the caller-supplied purpose, so
  //    authorization genuinely precedes any handling of the key.
  const purpose = await resolvePurposeAndAuthorize({
    actor: args.actor,
    requestedPurpose: args.purpose,
    operation,
    permissions: args.permissions,
    requestId: args.requestId,
    reason: args.reason,
    action,
    extra: { objectKey: args.objectKey },
  });

  // 3. validate the key: tenant prefix, shape, and agreement with the authorized purpose
  let parts: ReturnType<typeof assertKeyInWorkspace>;
  try {
    parts = assertKeyInWorkspace(args.objectKey, args.actor.workspaceId);
  } catch (error) {
    // A cross-tenant or malformed key is NOT a purpose mismatch. Labelling it as one
    // makes a tenant-boundary probe indistinguishable from a benign mix-up in the
    // audit trail (guardrail NF-1 / QA blocker).
    return await auditRefusal(
      { actor: args.actor, requestId: args.requestId, reason: args.reason, action: "file.download_url.issued" },
      "invalid_object_key",
      error,
      { requestedObjectKey: args.objectKey },
      tryKeyId(args.objectKey),
    );
  }
  if (parts.purpose !== purpose) {
    // Audited, not thrown: a denial must leave a trace. This was the F-2 blocker.
    return await auditRefusal(
      { actor: args.actor, requestId: args.requestId, reason: args.reason, action: "file.download_url.issued" },
      "purpose_key_mismatch",
      new InvalidObjectKeyError(
        `key purpose (${parts.purpose}) does not match the authorized purpose (${purpose})`,
      ),
      { requestedObjectKey: args.objectKey, authorizedPurpose: purpose },
      parts.id,
    );
  }

  // 4. clamp TTL - a refused exception is a denial and must be on the record
  let ttl: { ttlSeconds: number; exceptionName?: string };
  try {
    ttl = resolveTtl({
      purpose,
      operation,
      requestedTtlSeconds: args.requestedTtlSeconds,
      exceptionName: args.exceptionName,
    });
  } catch (error) {
    return await auditRefusal(
      { actor: args.actor, requestId: args.requestId, reason: args.reason, action: "file.download_url.issued" },
      args.exceptionName ? "invalid_ttl_exception" : "invalid_ttl",
      error,
      { purpose, operation, requestedTtlSeconds: args.requestedTtlSeconds ?? null, exceptionName: args.exceptionName ?? null },
      tryKeyId(args.objectKey),
    );
  }
  const { ttlSeconds, exceptionName } = ttl;

  const url = await getSignedUrl(s3, getObjectCommand(args.objectKey), { expiresIn: ttlSeconds });
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await withTenant(
    { orgId: args.actor.orgId, workspaceId: args.actor.workspaceId, actorId: args.actor.userId },
    async (tx) => {
      await writeAuditEvent(tx, {
        orgId: args.actor.orgId,
        workspaceId: args.actor.workspaceId,
        actorId: args.actor.userId,
        actorLabel: args.actor.label,
        action,
        category: "file",
        reason: args.reason,
        objectType: "object",
        objectId: parseObjectKey(args.objectKey).id,
        meta: {
          requestId: args.requestId,
          objectKey: args.objectKey,
          purpose,
          operation,
          method: methodOf(operation),
          expiresAt: expiresAt.toISOString(),
          ttlSeconds,
          // A presigned GET carries no encryption parameters: an object's SSE is a
          // property of the object, set when it was uploaded, not of this URL.
          sse: null,
          ...(exceptionName ? { exceptionName } : {}),
        },
      });
    },
  );

  return {
    url,
    method: methodOf(operation),
    operation,
    purpose,
    objectKey: args.objectKey,
    ttlSeconds,
    expiresAt,
    ...(exceptionName ? { exceptionName } : {}),
  };
}

/**
 * Record an actual file access attempt (a URL being followed), not just its issue.
 * Kept separate because access happens after the URL is handed over.
 */
export async function recordFileAccess(args: {
  actor: Actor;
  objectKey: string;
  operation: Operation;
  outcome: "granted" | "denied" | "not_found";
  requestId: string;
  reason: string;
}): Promise<void> {
  if (!hasValidReason(args.reason)) {
    return await refuseInvalidReason(
      { actor: args.actor, requestId: args.requestId, action: "file.accessed", reason: args.reason },
      new ValidationError("a reason of at least 3 characters is required for this action"),
    );
  }
  let parts: ReturnType<typeof parseObjectKey>;
  try {
    parts = parseObjectKey(args.objectKey);
    assertKeyInWorkspace(args.objectKey, args.actor.workspaceId);
  } catch (error) {
    return await auditRefusal(
      { actor: args.actor, requestId: args.requestId, reason: args.reason, action: "file.accessed" },
      "invalid_object_key",
      error,
      { requestedObjectKey: args.objectKey },
      tryKeyId(args.objectKey),
    );
  }
  await withTenant(
    { orgId: args.actor.orgId, workspaceId: args.actor.workspaceId, actorId: args.actor.userId },
    async (tx) => {
      await writeAuditEvent(tx, {
        orgId: args.actor.orgId,
        workspaceId: args.actor.workspaceId,
        actorId: args.actor.userId,
        actorLabel: args.actor.label,
        action: "file.accessed",
        category: "file",
        reason: args.reason,
        objectType: "object",
        objectId: parts.id,
        meta: {
          requestId: args.requestId,
          objectKey: args.objectKey,
          purpose: parts.purpose,
          operation: args.operation,
          outcome: args.outcome,
        },
      });
    },
  );
}
