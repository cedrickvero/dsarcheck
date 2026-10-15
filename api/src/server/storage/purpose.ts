/**
 * The server-side purpose allowlist.
 *
 * A purpose is never taken from user input: it is resolved against this table, and
 * anything unknown is refused. Each purpose declares the permission required to
 * exercise it, and the TTL each operation may be minted with.
 *
 * A purpose describes WHAT the object is (evidence, an identity document, a
 * generated pack). The operation describes what the URL may DO with it
 * (upload/download). That separation is deliberate: an object keeps one key for
 * its whole life, while a signed URL is scoped to a single operation.
 */

/** Global ceilings. Uploads 15 minutes, downloads 10 minutes. */
export const UPLOAD_TTL_CEILING_SECONDS = 900;
export const DOWNLOAD_TTL_CEILING_SECONDS = 600;

export type Operation = "upload" | "download";
export type HttpMethod = "GET" | "PUT";
export type Purpose = "evidence" | "identity_document" | "generated_pack";

export interface PurposePolicy {
  uploadPermission: string;
  downloadPermission: string;
  /** Optional per-purpose tightening. Never a loosening: the global ceiling wins. */
  uploadTtlCeilingSeconds?: number;
  downloadTtlCeilingSeconds?: number;
}

export const PURPOSE_POLICY: Record<Purpose, PurposePolicy> = {
  evidence: { uploadPermission: "files.upload", downloadPermission: "files.download" },
  identity_document: {
    uploadPermission: "files.upload",
    downloadPermission: "files.download",
    // Identity documents are more sensitive than evidence, so their URLs are shorter-lived.
    uploadTtlCeilingSeconds: 300,
    downloadTtlCeilingSeconds: 180,
  },
  generated_pack: { uploadPermission: "files.upload", downloadPermission: "files.download" },
};

export class UnknownPurposeError extends Error {
  constructor(candidate: string) {
    super(`purpose is not in the server-side allowlist: ${candidate}`);
    this.name = "UnknownPurposeError";
  }
}

export function isPurpose(value: string): value is Purpose {
  return Object.prototype.hasOwnProperty.call(PURPOSE_POLICY, value);
}

export function assertPurpose(value: unknown): Purpose {
  if (typeof value !== "string" || !isPurpose(value)) {
    throw new UnknownPurposeError(typeof value === "string" ? value : String(value));
  }
  return value;
}

export function methodOf(operation: Operation): HttpMethod {
  return operation === "upload" ? "PUT" : "GET";
}

export function operationOf(method: HttpMethod): Operation {
  return method === "PUT" ? "upload" : "download";
}

export function requiredPermission(purpose: Purpose, operation: Operation): string {
  const policy = PURPOSE_POLICY[purpose];
  return operation === "upload" ? policy.uploadPermission : policy.downloadPermission;
}

/** The effective ceiling: the global one, tightened by the purpose if it says so. */
export function ceilingFor(purpose: Purpose, operation: Operation): number {
  const policy = PURPOSE_POLICY[purpose];
  const global =
    operation === "upload" ? UPLOAD_TTL_CEILING_SECONDS : DOWNLOAD_TTL_CEILING_SECONDS;
  const specific =
    operation === "upload" ? policy.uploadTtlCeilingSeconds : policy.downloadTtlCeilingSeconds;
  return specific === undefined ? global : Math.min(global, specific);
}

/** A requested TTL is only ever a hint: it is clamped to the ceiling, never trusted. */
export function clampTtl(purpose: Purpose, operation: Operation, requestedSeconds?: number): number {
  const ceiling = ceilingFor(purpose, operation);
  if (requestedSeconds === undefined) return ceiling;
  if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0) {
    throw new Error(`requested TTL must be a positive number: ${requestedSeconds}`);
  }
  return Math.min(Math.floor(requestedSeconds), ceiling);
}

/**
 * Named TTL exceptions.
 *
 * The ceilings are the rule. An exception must be explicit (declared in config),
 * named (carried into the audit event), and may only extend the TTL for the exact
 * purpose and operation it was granted for. There is no wildcard.
 */
/**
 * Hard cap on any configured TTL exception. An exception is a deliberate, named,
 * audited widening of a ceiling - not a way to mint a week-long public URL. Values
 * above this are rejected when the config is parsed (i.e. at startup).
 */
export const EXCEPTION_TTL_HARD_CAP = 3600;

export interface TtlException {
  name: string;
  purpose: Purpose;
  operation: Operation;
  ttlSeconds: number;
}

export class UnknownTtlExceptionError extends Error {
  constructor(name: string, detail: string) {
    super(`TTL exception "${name}" is not usable: ${detail}`);
    this.name = "UnknownTtlExceptionError";
  }
}

/** Parse the configured exception list. Malformed config fails loudly. */
export function parseTtlExceptions(raw: string | undefined): Map<string, TtlException> {
  const out = new Map<string, TtlException>();
  if (!raw || raw.trim() === "") return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("SIGNED_URL_TTL_EXCEPTIONS is not valid JSON");
  }
  if (!Array.isArray(parsed)) throw new Error("SIGNED_URL_TTL_EXCEPTIONS must be a JSON array");
  for (const entry of parsed) {
    const e = entry as Partial<TtlException>;
    if (!e?.name || !e.purpose || !e.operation) {
      throw new Error("each TTL exception needs name, purpose and operation");
    }
    assertPurpose(e.purpose);
    if (e.operation !== "upload" && e.operation !== "download") {
      throw new Error(`TTL exception ${e.name}: operation must be upload or download`);
    }
    if (!Number.isInteger(e.ttlSeconds) || (e.ttlSeconds as number) <= 0) {
      throw new Error(`TTL exception ${e.name}: ttlSeconds must be a positive integer`);
    }
    if ((e.ttlSeconds as number) > EXCEPTION_TTL_HARD_CAP) {
      throw new Error(
        `TTL exception ${e.name}: ttlSeconds ${e.ttlSeconds} exceeds the hard cap of ${EXCEPTION_TTL_HARD_CAP}s`,
      );
    }
    out.set(e.name, e as TtlException);
  }
  return out;
}

/**
 * Resolve a TTL that the caller asked to exceed the ceiling. Requires a named
 * exception that matches BOTH the purpose and the operation, otherwise it throws.
 * Returns the TTL and the exception's name so the caller can audit both.
 */
export function resolveTtlWithException(args: {
  exceptions: Map<string, TtlException>;
  exceptionName: string;
  purpose: Purpose;
  operation: Operation;
  requestedSeconds: number;
}): { ttlSeconds: number; exceptionName: string } {
  // The exception branch must apply the same positive-TTL rule as clampTtl, or a
  // request of 0 yields a URL that expired before it was issued - and would be
  // persisted and audited as a success.
  if (!Number.isFinite(args.requestedSeconds) || args.requestedSeconds <= 0) {
    throw new Error(`requested TTL must be a positive number: ${args.requestedSeconds}`);
  }
  const found = args.exceptions.get(args.exceptionName);
  if (!found) {
    throw new UnknownTtlExceptionError(args.exceptionName, "not configured");
  }
  if (found.purpose !== args.purpose || found.operation !== args.operation) {
    throw new UnknownTtlExceptionError(
      args.exceptionName,
      `granted for ${found.purpose}/${found.operation}, not ${args.purpose}/${args.operation}`,
    );
  }
  return { ttlSeconds: Math.min(args.requestedSeconds, found.ttlSeconds), exceptionName: found.name };
}
