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
function assertAuditReason(reason: unknown): asserts reason is string {
  if (typeof reason !== "string" || reason.trim().length < 3) {
    throw new ValidationError("a reason of at least 3 characters is required for this action");
  }
}

/** Writes the "denied" audit row in the actor's OWN workspace, then rethrows. */
async function auditDenial(args: {
  actor: Actor;
  requestId: string;
  reason: string;
  action: string;
  requested: Record<string, unknown>;
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

/** Audits a refusal raised by the key-validation step, then rethrows it. */
async function auditKeyDenial(
  args: { actor: Actor; requestId: string; reason: string; action: string },
  error: unknown,
  requested: Record<string, unknown>,
): Promise<never> {
  const err = error instanceof Error ? error : new Error(String(error));
  return auditDenial({
    actor: args.actor,
    requestId: args.requestId,
    reason: args.reason,
    action: args.action,
    requested: { denialCode: "invalid_object_key", ...requested },
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
  assertAuditReason(args.reason);
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
    return await auditKeyDenial(
      { actor: args.actor, requestId: args.requestId, reason: args.reason, action: "file.upload_url.issued" },
      error,
      { requestedObjectId: args.objectId ?? null },
    );
  }
  // F-3: object_id must mean the SAME thing on every event. Downloads can only
  // know the key's uuid, so uploads record that too, with the row id kept beside it.
  const keyId = parseObjectKey(objectKey).id;

  // 4. clamp the TTL
  const { ttlSeconds, exceptionName } = resolveTtl({
    purpose,
    operation,
    requestedTtlSeconds: args.requestedTtlSeconds,
    exceptionName: args.exceptionName,
  });

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
  assertAuditReason(args.reason);
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
    return await auditKeyDenial(
      { actor: args.actor, requestId: args.requestId, reason: args.reason, action: "file.download_url.issued" },
      error,
      { requestedObjectKey: args.objectKey },
    );
  }
  if (parts.purpose !== purpose) {
    throw new InvalidObjectKeyError(
      `key purpose (${parts.purpose}) does not match the authorized purpose (${purpose})`,
    );
  }

  // 4. clamp TTL -> 5. mint
  const { ttlSeconds, exceptionName } = resolveTtl({
    purpose,
    operation,
    requestedTtlSeconds: args.requestedTtlSeconds,
    exceptionName: args.exceptionName,
  });

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
  assertAuditReason(args.reason);
  const parts = parseObjectKey(args.objectKey);
  assertKeyInWorkspace(args.objectKey, args.actor.workspaceId);
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
