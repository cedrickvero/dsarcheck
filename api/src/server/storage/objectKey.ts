/**
 * Object keys are tenant-scoped by construction.
 *
 *   ws/<workspaceId>/<purpose>/<uuid>
 *
 * The workspace is part of the key, which is what makes cross-tenant minting
 * impossible rather than merely discouraged: a URL can only be issued for a key
 * whose prefix matches the actor's database-derived workspace, and the database
 * enforces the same rule with a CHECK constraint (see the objects table).
 *
 * Nothing here trusts input: the purpose comes from the server-side allowlist in
 * purpose.ts, the uuid is generated server-side, and every parsed segment is
 * validated for shape and traversal.
 */
import { randomUUID } from "node:crypto";
import { type Purpose, assertPurpose } from "./purpose";

export const KEY_NAMESPACE = "ws";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGMENT_RE = /^[A-Za-z0-9_-]+$/;

export class InvalidObjectKeyError extends Error {
  constructor(reason: string, key?: string) {
    super(key ? `invalid object key (${reason}): ${key}` : `invalid object key (${reason})`);
    this.name = "InvalidObjectKeyError";
  }
}

export interface ObjectKeyParts {
  workspaceId: string;
  purpose: Purpose;
  id: string;
}

/**
 * Build a key. The id may be supplied (to reference an object created earlier in
 * the same request) but is always generated here when absent.
 */
export function buildObjectKey(args: {
  workspaceId: string;
  purpose: Purpose;
  id?: string;
}): string {
  const purpose = assertPurpose(args.purpose);
  assertWorkspaceId(args.workspaceId);
  const id = args.id ?? randomUUID();
  if (!UUID_RE.test(id)) throw new InvalidObjectKeyError("id is not a UUID");
  return `${KEY_NAMESPACE}/${args.workspaceId}/${purpose}/${id}`;
}

/** Parse and fully validate a key. Throws InvalidObjectKeyError on anything odd. */
export function parseObjectKey(key: string): ObjectKeyParts {
  if (typeof key !== "string" || key.length === 0) throw new InvalidObjectKeyError("empty");
  if (key.length > 512) throw new InvalidObjectKeyError("too long");
  if (key.includes("\\")) throw new InvalidObjectKeyError("backslash", key);
  if (/[\u0000-\u001f\u007f]/.test(key)) throw new InvalidObjectKeyError("control character", key);

  const segments = key.split("/");
  if (segments.length !== 4) throw new InvalidObjectKeyError(`expected 4 segments, got ${segments.length}`, key);
  for (const s of segments) {
    if (s.length === 0) throw new InvalidObjectKeyError("empty segment", key);
    if (s === "." || s === "..") throw new InvalidObjectKeyError("path traversal", key);
    if (!SEGMENT_RE.test(s)) throw new InvalidObjectKeyError(`illegal characters in segment: ${s}`, key);
  }
  const [ns, workspaceId, rawPurpose, id] = segments as [string, string, string, string];
  if (ns !== KEY_NAMESPACE) throw new InvalidObjectKeyError(`bad namespace: ${ns}`, key);
  assertWorkspaceId(workspaceId);
  const purpose = assertPurpose(rawPurpose);
  if (!UUID_RE.test(id)) throw new InvalidObjectKeyError("id is not a UUID", key);
  return { workspaceId, purpose, id };
}

/**
 * The cross-tenant guard. Both the prefix and the parsed workspace must match the
 * actor's workspace; a key for anyone else is refused outright.
 */
export function assertKeyInWorkspace(key: string, workspaceId: string): ObjectKeyParts {
  const parts = parseObjectKey(key);
  if (parts.workspaceId !== workspaceId) {
    throw new InvalidObjectKeyError("key belongs to a different workspace");
  }
  if (!key.startsWith(`${KEY_NAMESPACE}/${workspaceId}/`)) {
    throw new InvalidObjectKeyError("key prefix does not match the workspace");
  }
  return parts;
}

export function assertWorkspaceId(workspaceId: string): void {
  if (!UUID_RE.test(workspaceId)) throw new InvalidObjectKeyError("workspaceId is not a UUID");
}
