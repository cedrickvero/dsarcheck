import { logError } from "@/server/log";

/**
 * Typed application errors plus the single JSON error envelope every route
 * handler returns: { error: { code, message, requestId } }.
 *
 * Server-only: never import this into a client component.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "AppError";
  }
}

/**
 * Placeholder for surfaces not built yet. Every unimplemented route fails
 * loudly and typed rather than silently returning an empty body.
 */
export class NotImplementedError extends AppError {
  constructor(area: string) {
    super(501, "not_implemented", `${area} is not implemented yet`);
    this.name = "NotImplementedError";
  }
}

/**
 * Authentication failures share ONE generic code and message on purpose: sign-in must
 * not reveal whether an address exists, whether an account has MFA enabled, or whether
 * a code was wrong versus replayed.
 */
export class UnauthenticatedError extends AppError {
  constructor() {
    super(401, "unauthenticated", "Sign-in failed. Check your link or code and try again.");
  }
}

/** Authenticated, but not permitted. Distinct from 401 so the audit trail can tell them apart. */
export class ForbiddenError extends AppError {
  constructor(detail: string) {
    super(403, "forbidden", detail);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super(429, "rate_limited", "Too many attempts. Try again later.");
  }
}

/** MFA is required for this role and has not been satisfied on this session. */
export class MfaRequiredError extends AppError {
  constructor() {
    super(401, "mfa_required", "Multi-factor verification is required to continue.");
  }
}

export class ValidationError extends AppError {
  constructor(detail: string) {
    super(422, "validation_failed", detail);
    this.name = "ValidationError";
  }
}

export interface ErrorEnvelope {
  error: { code: string; message: string; requestId: string };
}

/**
 * Strip control characters and cap the length of anything we echo back. A crafted
 * message must not be able to smuggle newlines or terminal escapes into a response
 * body or a log line.
 */
export function sanitizeMessage(message: string): string {
  // eslint-disable-next-line no-control-regex
  const stripped = message.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
  return stripped.length > 300 ? `${stripped.slice(0, 297)}...` : stripped;
}

/** Map any thrown value to a status + envelope without leaking internals. */
export function toErrorEnvelope(
  err: unknown,
  requestId: string,
): { status: number; body: ErrorEnvelope } {
  const isApp = err instanceof AppError;
  const status = isApp ? err.status : 500;
  const code = isApp ? err.code : "internal_error";

  // Only errors we authored may surface their message. Anything unrecognised - a
  // driver error, a SQL fragment, a stack - is replaced wholesale.
  const message = isApp ? sanitizeMessage(err.message) : "Internal server error";

  if (isApp && status >= 500 && !(err instanceof NotImplementedError)) {
    // A real server-side failure we authored. Logged through logError: a sanitised
    // summary, never the raw object (which can carry SQL, bound parameters and a stack).
    logError("request", err, { requestId, code, status });
  } else if (!isApp) {
    // Unexpected: this is the one case that must never be silent.
    logError("request-unhandled", err, { requestId });
  }
  // 4xx and intentional 501 stubs are expected traffic and deliberately log nothing.
  // Logging a stack for every 501 made real incidents unreadable.

  return { status, body: { error: { code, message, requestId } } };
}
