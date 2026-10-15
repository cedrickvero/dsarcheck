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
import { assertKeyInWorkspace, buildObjectKey, InvalidObjectKeyError, parseObjectKey } from "./objectKey";
import {
  assertPurpose,
  clampTtl,
  methodOf,
  parseTtlExceptions,
  requiredPermission,
  resolveTtlWithException,
  type HttpMethod,
  type Operation,
  type Purpose,
} from "./purpose";
import { getObjectCommand, putObjectCommand, s3 } from "./s3Client";

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
    if (error instanceof AuthorizationDeniedError) {
      await auditDenial({
        actor: args.actor,
        requestId: args.requestId,
        reason: args.reason,
        action: args.action,
        requested: { purpose: args.requestedPurpose, ...args.extra },
        error,
      });
    }
    throw error;
  }
}

export async function issueUploadUrl(args: IssueUploadUrlArgs): Promise<IssuedUrl> {
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
  const objectKey = buildObjectKey({
    workspaceId: args.actor.workspaceId,
    purpose,
    id: args.objectId,
  });
  assertKeyInWorkspace(objectKey, args.actor.workspaceId);

  // 4. clamp the TTL
  const { ttlSeconds, exceptionName } = resolveTtl({
    purpose,
    operation,
    requestedTtlSeconds: args.requestedTtlSeconds,
    exceptionName: args.exceptionName,
  });

  // 5. SSE + mint
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
        objectId: row?.id ?? null,
        meta: {
          requestId: args.requestId,
          objectKey,
          purpose,
          operation,
          method: methodOf(operation),
          expiresAt: expiresAt.toISOString(),
          ttlSeconds,
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
  const parts = assertKeyInWorkspace(args.objectKey, args.actor.workspaceId);
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
