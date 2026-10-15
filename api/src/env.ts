import "dotenv/config";
import { z } from "zod";
import { EXCEPTION_TTL_HARD_CAP, validateTtlExceptions } from "@/server/storage/purpose";

/**
 * Single source of truth for runtime configuration.
 *
 * Parsed once at import so the process fails fast on a bad value rather than
 * discovering it mid-request. Defaults are development-safe so the scaffold
 * boots without a .env file; production must supply real values.
 */
/**
 * Development-only defaults.
 *
 * Every value below lets a fresh checkout run locally with no configuration. Their
 * presence in production is a security defect, not a convenience - a production
 * process must never silently inherit a dev host, a placeholder password or a
 * localhost base URL. The startup guard below rejects each of them by name, and the
 * schema references these constants so the two cannot drift apart.
 */
export const DEV_DEFAULT_DATABASE_URL =
  "postgres://hermes:hermes_dev_password@127.0.0.1:5432/hermes_dsar";
export const DEV_DEFAULT_APP_DATABASE_URL =
  "postgres://app_runtime:app_runtime_dev_password@hermes_dsar_postgres:5432/hermes_dsar";
export const DEV_DEFAULT_APP_DB_PASSWORD = "app_runtime_dev_password";
const DEV_DEFAULT_S3_ACCESS_KEY = "hermes";
const DEV_DEFAULT_S3_SECRET_KEY = "hermes_dev_password";
const DEV_DEFAULT_APP_BASE_URL = "http://localhost:3000";
const DEV_DEFAULT_S3_ENDPOINT = "http://127.0.0.1:9000";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z
    .string()
    .min(1)
    .default(DEV_DEFAULT_DATABASE_URL),

  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),

  S3_ENDPOINT: z.string().default(DEV_DEFAULT_S3_ENDPOINT),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("dsar-evidence"),
  S3_ACCESS_KEY: z.string().default("hermes"),
  S3_SECRET_KEY: z.string().default("hermes_dev_password"),
  /** "AES256" (default) or "aws:kms". KMS additionally needs S3_KMS_KEY_ID. */
  S3_SSE_ALGORITHM: z.enum(["AES256", "aws:kms"]).default("AES256"),
  S3_KMS_KEY_ID: z.string().optional(),
  /**
   * Named TTL exceptions, as a JSON array:
   *   [{"name":"legal-hold-export","purpose":"generated_pack","operation":"download","ttlSeconds":3600}]
   * An exception extends the TTL for exactly one purpose+operation and its name is
   * written into the audit event. Empty by default: the ceilings are the rule.
   */
  SIGNED_URL_TTL_EXCEPTIONS: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  SMTP_HOST: z.string().default("127.0.0.1"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_FROM: z.string().default("no-reply@privacyspace.local"),
  /** Signs the session cookie. Required in production; unused until T-08 sets one. */
  SESSION_SECRET: z.string().default(""),
  // Explicit string enums rather than z.coerce.boolean(), which maps the string
  // "false" to true - a silent security flip.
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  SMTP_IGNORE_TLS: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),

  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_OWNER_USER: z.string().default("hermes"),

  // The APPLICATION connects with this DSN: a least-privilege LOGIN role.
  // DATABASE_URL above is the admin/owner DSN (migrations + test setup only).
  APP_DATABASE_URL: z
    .string()
    .min(1)
    .default(DEV_DEFAULT_APP_DATABASE_URL),
  APP_DB_PASSWORD: z.string().default(DEV_DEFAULT_APP_DB_PASSWORD),


  APP_BASE_URL: z.string().default(DEV_DEFAULT_APP_BASE_URL),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Cross-field guard, evaluated at import time - that is, at startup.
 *
 * Selecting KMS encryption without naming a key is a misconfiguration that must stop
 * the process loudly rather than surface on the first upload attempt. parse() throws,
 * so the server and the worker both fail to boot with the reason attached.
 */
const checkedEnvSchema = envSchema.refine(
  (e) => e.S3_SSE_ALGORITHM !== "aws:kms" || Boolean(e.S3_KMS_KEY_ID?.trim()),
  {
    message: "S3_SSE_ALGORITHM=aws:kms requires S3_KMS_KEY_ID to be set",
    path: ["S3_KMS_KEY_ID"],
  },
);

/**
 * Cross-field guard for TTL exceptions, evaluated at import time. An exception
 * widens a signed-URL ceiling, so a malformed or over-cap entry is a security
 * misconfiguration, not a runtime detail: it must stop the process at startup.
 */
const finalEnvSchema = checkedEnvSchema.refine(
  (e) => {
    const raw = e.SIGNED_URL_TTL_EXCEPTIONS;
    if (!raw || raw.trim() === "") return true;
    try {
      return validateTtlExceptions(JSON.parse(raw)) === null;
    } catch {
      return false;
    }
  },
  {
    message:
      "SIGNED_URL_TTL_EXCEPTIONS must be a JSON array of {name, purpose, operation, ttlSeconds} " +
      "where purpose is a configured purpose, operation is upload|download, and " +
      `0 < ttlSeconds <= ${EXCEPTION_TTL_HARD_CAP}`,
    path: ["SIGNED_URL_TTL_EXCEPTIONS"],
  },
);



/**
 * Production completeness guard (R3).
 *
 * These settings carry development defaults so a fresh checkout runs locally with no
 * configuration. In production, silently inheriting one is a security defect, not a
 * convenience - so the process refuses to start rather than run insecurely.
 */
function computeProductionProblems(opts: { isBuildPhase: boolean }): string[] {
  const e = envSchema.parse(process.env);
  if (process.env.NODE_ENV !== "production") return [];
  // `next build` runs with NODE_ENV=production and legitimately has no production
  // secrets, so the IMPORT-TIME check stands down during the build. The runtime
  // assertion below does NOT - that is what stops this exemption becoming a bypass.
  if (opts.isBuildPhase) return [];

  const problems: string[] = [];
  /** True when the operator never set the variable, so a development default applies. */
  const unset = (key: string): boolean =>
    process.env[key] === undefined || process.env[key] === "";

  if (e.APP_DATABASE_URL === DEV_DEFAULT_APP_DATABASE_URL) {
    problems.push(
      "APP_DATABASE_URL is still the development default: production must name its own least-privilege DSN",
    );
  }
  // Defence in depth against the constant and the schema default drifting apart again: a
  // DSN need not be byte-identical to the default to be unsafe.
  //
  // Only the development PASSWORD is treated as the signal. The HOST deliberately is NOT:
  // naming the compose service host (hermes_dsar_postgres) is exactly what a correctly
  // configured production deployment on this network does, so rejecting on the host
  // refused safe configurations - which is how this guard was caught over-blocking.
  else if (e.APP_DATABASE_URL.includes(DEV_DEFAULT_APP_DB_PASSWORD)) {
    problems.push(
      "APP_DATABASE_URL carries the development password: production must name its own least-privilege DSN",
    );
  }
  if (e.APP_DB_PASSWORD === DEV_DEFAULT_APP_DB_PASSWORD) {
    problems.push("APP_DB_PASSWORD is still the development default");
  }
  if (e.S3_ACCESS_KEY === DEV_DEFAULT_S3_ACCESS_KEY) {
    problems.push("S3_ACCESS_KEY is still the development default");
  }
  if (e.S3_SECRET_KEY === DEV_DEFAULT_S3_SECRET_KEY) {
    problems.push("S3_SECRET_KEY is still the development default");
  }
  if (e.S3_ENDPOINT === DEV_DEFAULT_S3_ENDPOINT || /^https?:\/\/(localhost|127\.0\.0\.1)/.test(e.S3_ENDPOINT)) {
    problems.push("S3_ENDPOINT must not point at localhost in production");
  }
  if (e.APP_BASE_URL === DEV_DEFAULT_APP_BASE_URL || !e.APP_BASE_URL.startsWith("https://")) {
    problems.push("APP_BASE_URL must be an https origin in production");
  }
  if (e.SMTP_IGNORE_TLS) {
    problems.push("SMTP_IGNORE_TLS must not be enabled in production");
  }

  // FINDING B. DATABASE_URL's development default is the ADMIN/SUPERUSER DSN: silently
  // inheriting a superuser connection string in production is what this guard exists to
  // stop, even though it is not used on the request path today.
  if (unset("DATABASE_URL") || e.DATABASE_URL === DEV_DEFAULT_DATABASE_URL) {
    problems.push(
      "DATABASE_URL must be set explicitly in production: its default is the development ADMIN (superuser) DSN",
    );
  }
  if (unset("REDIS_URL")) {
    problems.push(
      "REDIS_URL must be set explicitly in production: the development default is an unauthenticated localhost",
    );
  }
  if (unset("SMTP_HOST")) {
    problems.push("SMTP_HOST must be set explicitly in production");
  }
  if (unset("SMTP_FROM")) {
    problems.push("SMTP_FROM must be set explicitly in production");
  }
  // Requirement 8's "missing cookie secret".
  if (unset("SESSION_SECRET") || e.SESSION_SECRET.length < 32) {
    problems.push("SESSION_SECRET must be set to at least 32 characters in production");
  }

  // Values that must be chosen deliberately rather than inherited. Each of these has a
  // development default that would otherwise apply silently in production.
  if (unset("S3_BUCKET")) {
    problems.push("S3_BUCKET must be set explicitly: the development bucket name would be used");
  }
  if (unset("S3_FORCE_PATH_STYLE")) {
    problems.push("S3_FORCE_PATH_STYLE must be set explicitly rather than inherited");
  }
  if (unset("DB_OWNER_USER")) {
    problems.push(
      "DB_OWNER_USER must be set explicitly: it names the owner role the least-privilege assertion checks against",
    );
  }
  if (unset("DB_POOL_MAX")) {
    problems.push("DB_POOL_MAX must be set explicitly rather than inherited");
  }
  if (unset("SMTP_PORT") || unset("SMTP_SECURE")) {
    problems.push("SMTP_PORT and SMTP_SECURE must both be set explicitly in production");
  } else if (e.SMTP_PORT === 465 && !e.SMTP_SECURE) {
    problems.push("SMTP_PORT 465 requires SMTP_SECURE=true (implicit TLS)");
  } else if (e.SMTP_PORT !== 465 && e.SMTP_SECURE) {
    problems.push(`SMTP_PORT ${e.SMTP_PORT} requires SMTP_SECURE=false with STARTTLS`);
  }
  return problems;
}

const importTimeProblems = computeProductionProblems({
  isBuildPhase: process.env.NEXT_PHASE === "phase-production-build",
});
if (importTimeProblems.length > 0) {
  throw new Error(
    `refusing to start in production with unsafe configuration:\n  - ${importTimeProblems.join("\n  - ")}`,
  );
}

/**
 * Runtime re-assertion, deliberately WITHOUT the build-phase exemption.
 *
 * The exemption keys off NEXT_PHASE, which is an ordinary MUTABLE environment
 * variable. Any in-process code that sets it before env.ts is first imported could
 * otherwise skip the guard completely - verified reachable: with NODE_ENV=production,
 * development defaults, and NEXT_PHASE=phase-production-build, the import-time check
 * does not fire. This entry point exists so the server refuses to SERVE regardless of
 * how its environment was assembled, and is called from the instrumentation hook.
 */
export function assertProductionConfig(): void {
  const problems = computeProductionProblems({ isBuildPhase: false });
  if (problems.length > 0) {
    throw new Error(
      `refusing to serve in production with unsafe configuration:\n  - ${problems.join("\n  - ")}`,
    );
  }
}

export const env: Env = finalEnvSchema.parse(process.env);
