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
const DEV_DEFAULT_APP_DATABASE_URL =
  "postgres://app_runtime:***@hermes_dsar_postgres:5432/hermes_dsar";
const DEV_DEFAULT_APP_DB_PASSWORD = "app_runtime_dev_password";
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
    .default("postgres://hermes:hermes_dev_password@127.0.0.1:5432/hermes_dsar"),

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
    .default("postgres://app_runtime:app_runtime_dev_password@hermes_dsar_postgres:5432/hermes_dsar"),
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
function productionProblems(): string[] {
  const e = envSchema.parse(process.env);
  if (process.env.NODE_ENV !== "production") return [];
  // It is a RUNTIME guard. `next build` also runs with NODE_ENV=production, and a
  // build stage legitimately has no production secrets - so refusing there would
  // make every production build fail (verified: it broke `npm run build` with
  // "Failed to collect page data for /health"). The guard fires when the server
  // actually starts serving, which is the moment the risk exists.
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  const problems: string[] = [];
  if (e.APP_DATABASE_URL === DEV_DEFAULT_APP_DATABASE_URL) {
    problems.push(
      "APP_DATABASE_URL is still the development default: production must name its own least-privilege DSN",
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
    // A localhost object store in production means evidence uploads silently target
    // a machine that does not hold the data - and is usually a leftover dev default.
    problems.push("S3_ENDPOINT must not point at localhost in production");
  }
  if (e.APP_BASE_URL === DEV_DEFAULT_APP_BASE_URL || !e.APP_BASE_URL.startsWith("https://")) {
    // A localhost or http base URL in production breaks Secure cookies, redirects and
    // password-reset links, and quietly downgrades transport.
    problems.push("APP_BASE_URL must be an https origin in production");
  }
  if (e.SMTP_IGNORE_TLS) {
    problems.push("SMTP_IGNORE_TLS must not be enabled in production");
  }
  return problems;
}

const problems = productionProblems();
if (problems.length > 0) {
  throw new Error(
    `refusing to start in production with unsafe configuration:\n  - ${problems.join("\n  - ")}`,
  );
}

export const env: Env = finalEnvSchema.parse(process.env);
