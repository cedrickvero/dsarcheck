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

/**
 * Validates one configured TTL-exception entry. Returns a problem description, or
 * null when the entry is usable.
 *
 * Guardrail NF-5: the startup guard and the runtime parser used to implement these
 * shape rules separately (and differently), so a change to one would not reach the
 * other. Both now call this.
 */
export function validateTtlExceptionEntry(entry: unknown): string | null {
  const e = entry as Partial<TtlException> | null;
  if (!e || typeof e !== "object") return "each TTL exception must be an object";
  if (typeof e.name !== "string" || e.name.trim() === "") {
    return "each TTL exception needs a non-blank name";
  }
  if (typeof e.purpose !== "string" || !isPurpose(e.purpose)) {
    return `purpose must be one of: ${Object.keys(PURPOSE_POLICY).join(", ")}`;
  }
  if (e.operation !== "upload" && e.operation !== "download") {
    return "operation must be upload or download";
  }
  if (!Number.isInteger(e.ttlSeconds) || (e.ttlSeconds as number) <= 0) {
    return "ttlSeconds must be a positive integer";
  }
  if ((e.ttlSeconds as number) > EXCEPTION_TTL_HARD_CAP) {
    return `ttlSeconds exceeds the hard cap of ${EXCEPTION_TTL_HARD_CAP}s (0 < ttlSeconds <= ${EXCEPTION_TTL_HARD_CAP})`;
  }
  return null;
}

/** Validates a whole exception list. Returns the first problem, or null. */
export function validateTtlExceptions(raw: unknown): string | null {
  if (!Array.isArray(raw)) return "SIGNED_URL_TTL_EXCEPTIONS must be a JSON array";
  for (const entry of raw) {
    const problem = validateTtlExceptionEntry(entry);
    if (problem) return problem;
  }
  return null;
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
  const problem = validateTtlExceptions(parsed);
  if (problem) {
    // Preserve the error TYPE for an unknown purpose: callers branch on it, and a
    // shared validator returns only a string. assertPurpose throws the typed error.
    if (Array.isArray(parsed)) {
      // only when a purpose string is PRESENT but invalid - a missing purpose gets
      // the more specific "purpose must be one of ..." message above
      const bad = (parsed as Array<{ purpose?: unknown }>).find(
        (e) => typeof e?.purpose === "string" && !isPurpose(e.purpose),
      );
      if (bad) assertPurpose(bad.purpose as string);
    }
    throw new Error(problem);
  }
  for (const entry of parsed as TtlException[]) out.set(entry.name, entry);
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
