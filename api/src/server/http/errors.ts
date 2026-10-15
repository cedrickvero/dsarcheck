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

/** Map any thrown value to a status + envelope without leaking internals. */
export function toErrorEnvelope(
  err: unknown,
  requestId: string,
): { status: number; body: ErrorEnvelope } {
  const status = err instanceof AppError ? err.status : 500;
  const code = err instanceof AppError ? err.code : "internal_error";
  const message =
    status >= 500 && !(err instanceof AppError)
      ? "Internal server error"
      : (err as Error).message;

  if (status >= 500) {
    console.error(`[${requestId}]`, err);
  }

  return { status, body: { error: { code, message, requestId } } };
}
