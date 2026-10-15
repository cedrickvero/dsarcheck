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
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  SMTP_HOST: z.string().default("127.0.0.1"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_FROM: z.string().default("no-reply@privacyspace.local"),

  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_OWNER_USER: z.string().default("hermes"),

  APP_BASE_URL: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
