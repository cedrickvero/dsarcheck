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
