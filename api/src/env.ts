import "dotenv/config";
import { z } from "zod";

/**
 * Single source of truth for runtime configuration.
 *
 * Parsed once at import so the process fails fast on a bad value rather than
 * discovering it mid-request. Defaults are development-safe so the scaffold
 * boots without a .env file; production must supply real values.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://hermes:hermes_dev_password@127.0.0.1:5432/hermes_dsar"),

  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),

  S3_ENDPOINT: z.string().default("http://127.0.0.1:9000"),
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

  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_OWNER_USER: z.string().default("hermes"),

  // The APPLICATION connects with this DSN: a least-privilege LOGIN role.
  // DATABASE_URL above is the admin/owner DSN (migrations + test setup only).
  APP_DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://app_runtime:app_runtime_dev_password@hermes_dsar_postgres:5432/hermes_dsar"),
  APP_DB_PASSWORD: z.string().default("app_runtime_dev_password"),


  APP_BASE_URL: z.string().default("http://localhost:3000"),
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
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return false;
      return parsed.every((x) => {
        const t = (x as { ttlSeconds?: unknown }).ttlSeconds;
        return Number.isInteger(t) && (t as number) > 0 && (t as number) <= 3600;
      });
    } catch {
      return false;
    }
  },
  {
    message:
      "SIGNED_URL_TTL_EXCEPTIONS must be a JSON array of {name, purpose, operation, ttlSeconds} with 0 < ttlSeconds <= 3600",
    path: ["SIGNED_URL_TTL_EXCEPTIONS"],
  },
);


export const env: Env = finalEnvSchema.parse(process.env);
