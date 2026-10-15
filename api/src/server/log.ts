/**
 * The only sanctioned way this codebase writes an error to a log.
 *
 * Logging a RAW error object leaks internals. A Drizzle/pg error carries the literal
 * SQL, its bound parameter array (for this product that includes the human-entered
 * reason and the object key), schema/table/constraint names, a Postgres C source file
 * name, line numbers, and a JS stack trace with repository paths. R3 requires responses
 * AND logs to stay free of SQL, internal paths, tokens, credentials and personal data;
 * N-2 separately requires the failed-audit-write alert to expose no internals.
 *
 * So we log a SUMMARY: the error class, a driver code and constraint name where present,
 * a short message ONLY if it passes a conservative safety check, and caller-supplied
 * correlation fields. Never the object, never the stack, never a bound parameter.
 *
 * Server-only. No node builtins, so it is safe in the edge-compiled instrumentation hook.
 */

/** Suggests the text may carry SQL, a DSN, a bound parameter, a credential or an address. */
const RISKY_MESSAGE =
  /(select|insert|update|delete|truncate|drop|alter|\bfrom\b|\bwhere\b|\bvalues\b|:\/\/|\$\d|@|password|secret|token|bearer|key=)/i;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/** A short safe rendering of a message, or null when it could carry internals. */
export function safeMessage(message: unknown): string | null {
  if (typeof message !== "string") return null;
  const firstLine = (message.split("\n")[0] ?? "").replace(CONTROL_CHARS, " ").trim();
  if (firstLine === "" || firstLine.length > 200) return null;
  if (RISKY_MESSAGE.test(firstLine)) return null;
  return firstLine;
}

/** A short, safe token for a structural field (error name, driver code, constraint, table). */
export function safeToken(value: unknown, max = 80): string {
  const text = String(value ?? "")
    .replace(CONTROL_CHARS, " ")
    .trim();
  if (text === "" || text.length > max || RISKY_MESSAGE.test(text)) return "redacted";
  return text;
}

/** A sanitised one-line description. Never the error object, never a stack. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return `non-error thrown (${typeof error})`;
  const fields: string[] = [safeToken(error.name, 40)];
  const direct = error as { code?: unknown };
  if (typeof direct.code === "string" || typeof direct.code === "number") {
    fields.push(`code=${safeToken(direct.code, 20)}`);
  }
  const cause = (error as { cause?: { code?: unknown; constraint?: unknown; table?: unknown } })
    .cause;
  if (typeof cause?.code === "string") fields.push(`cause_code=${safeToken(cause.code, 20)}`);
  if (typeof cause?.constraint === "string") fields.push(`constraint=${safeToken(cause.constraint)}`);
  if (typeof cause?.table === "string") fields.push(`table=${safeToken(cause.table)}`);
  const safe = safeMessage(error.message);
  fields.push(safe === null ? "message=redacted" : `message=${safe}`);
  return fields.join(" ");
}

export type LogContext = Record<string, string | number | undefined>;

/** Log an error as a sanitised one-liner. The ONLY error-logging entry point. */
export function logError(scope: string, error: unknown, context: LogContext = {}): void {
  const extras = Object.entries(context)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${safeToken(key, 32)}=${safeToken(value, 120)}`)
    .join(" ");
  console.error(`[${scope}] ${describeError(error)}${extras ? ` ${extras}` : ""}`);
}
