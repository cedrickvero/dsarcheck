import { spawnSync } from "node:child_process";
import {
  DEV_DEFAULT_APP_DATABASE_URL, DEV_DEFAULT_TOTP_KEY,
  DEV_DEFAULT_DATABASE_URL,
  DEV_DEFAULT_REDIS_URL,
  DEV_DEFAULT_SMTP_FROM,
  DEV_DEFAULT_SMTP_HOST,
} from "../src/env";
import { describe, expect, it } from "vitest";

const TSX = "node_modules/.bin/tsx";
// Never inherit the ambient APP_DATABASE_URL: with repoenv.sh sourced it IS the
// development DSN, which made this "safe production configuration" fixture unsafe
// and dependent on the calling shell.
const APP_DB = "postgres://app_runtime:prod-db-password@db.prod.internal:5432/dsar";

function load(overrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    APP_DATABASE_URL: APP_DB,
    S3_ACCESS_KEY: "prod-access-key",
    S3_SECRET_KEY: "prod-secret-key",
    APP_DB_PASSWORD: "prod-db-password",
    APP_BASE_URL: "https://app.example.com",
    S3_ENDPOINT: "https://s3.eu-west-2.amazonaws.com",
    S3_BUCKET: "dsar-production",
    S3_FORCE_PATH_STYLE: "false",
    DB_OWNER_USER: "dsar_owner",
    DB_POOL_MAX: "20",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_IGNORE_TLS: "false",
    TOTP_ENCRYPTION_KEY: "cHJvZHVjdGlvbi10b3RwLWtleS0zMi1ieXRlcy1vayE=",
    DATABASE_URL: "postgres://dsar_owner:strong-production-owner-password@db.internal:5432/dsar",
    REDIS_URL: "redis://:strong-production-redis-password@redis.internal:6379",
    SMTP_HOST: "smtp.internal",
    SMTP_FROM: "no-reply@privacyspace.example",
    SESSION_SECRET: "a-production-session-secret-of-sufficient-length",
    ...overrides,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
  }
  return spawnSync(TSX, ["-e", 'import("./src/env.ts").then(() => console.log("LOADED"))'], {
    encoding: "utf8",
    env,
  });
}

/**
 * The import-time guard stands down during `next build`, keyed off NEXT_PHASE - a
 * MUTABLE environment variable. The guardrail proved that setting it before env.ts is
 * imported skips the guard entirely. These cases assert the runtime entry point does
 * NOT have that exemption, so the server refuses to serve regardless.
 */
function loadAndAssert(overrides: Record<string, string | undefined>) {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    APP_DATABASE_URL: APP_DB,
    S3_ACCESS_KEY: "prod-access-key",
    S3_SECRET_KEY: "prod-secret-key",
    APP_DB_PASSWORD: "prod-db-password",
    APP_BASE_URL: "https://app.example.com",
    S3_ENDPOINT: "https://s3.eu-west-2.amazonaws.com",
    S3_BUCKET: "dsar-production",
    S3_FORCE_PATH_STYLE: "false",
    DB_OWNER_USER: "dsar_owner",
    DB_POOL_MAX: "20",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_IGNORE_TLS: "false",
    TOTP_ENCRYPTION_KEY: "cHJvZHVjdGlvbi10b3RwLWtleS0zMi1ieXRlcy1vayE=",
    DATABASE_URL: "postgres://dsar_owner:strong-production-owner-password@db.internal:5432/dsar",
    REDIS_URL: "redis://:strong-production-redis-password@redis.internal:6379",
    SMTP_HOST: "smtp.internal",
    SMTP_FROM: "no-reply@privacyspace.example",
    SESSION_SECRET: "a-production-session-secret-of-sufficient-length",
    ...overrides,
  } as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(overrides)) if (v === undefined) delete env[k];
  return spawnSync(
    TSX,
    [
      "-e",
      'import("./src/env.ts").then(async (m) => { try { m.assertProductionConfig(); console.log("NOT_REFUSED"); process.exit(0); } catch (e) { console.log("REFUSED"); process.exit(1); } })',
    ],
    { encoding: "utf8", env },
  );
}

describe("production config guard (R3)", () => {
  it("starts with safe production configuration", () => {
    const r = load({});
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("LOADED");
  });

  it.each([
    ["S3_BUCKET"],
    ["S3_FORCE_PATH_STYLE"],
    ["DB_OWNER_USER"],
    ["DB_POOL_MAX"],
    ["SMTP_PORT"],
    ["SMTP_SECURE"],
  ])("refuses %s when it is left unset in production", (key) => {
    const r = load({ [key]: undefined });
    expect(r.status, `${key} was inherited silently`).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(new RegExp(key));
  });

  it("refuses a TLS/port mismatch that would silently downgrade", () => {
    const bad = load({ SMTP_PORT: "465", SMTP_SECURE: "false" });
    expect(bad.status).not.toBe(0);
    expect(`${bad.stdout}${bad.stderr}`).toMatch(/465 requires SMTP_SECURE=true/);

    const alsoBad = load({ SMTP_PORT: "587", SMTP_SECURE: "true" });
    expect(alsoBad.status).not.toBe(0);
    expect(`${alsoBad.stdout}${alsoBad.stderr}`).toMatch(/requires SMTP_SECURE=false with STARTTLS/);

    expect(load({ SMTP_PORT: "465", SMTP_SECURE: "true" }).status).toBe(0);
    expect(load({ SMTP_PORT: "587", SMTP_SECURE: "false" }).status).toBe(0);
  });

  it("does NOT fire during the production BUILD phase (a build stage has no secrets)", () => {
    const r = load({
      NEXT_PHASE: "phase-production-build",
      S3_ACCESS_KEY: "hermes",
      S3_SECRET_KEY: "hermes_dev_password",
      APP_BASE_URL: "http://localhost:3000",
    });
    expect(r.status, "the guard broke the build").toBe(0);
    expect(r.stdout).toContain("LOADED");
  });

  it("refuses the development S3 secret default", () => {
    const r = load({ S3_SECRET_KEY: "hermes_dev_password" });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/S3_SECRET_KEY is still the development default/);
  });

  it("refuses the development S3 access-key default", () => {
    const r = load({ S3_ACCESS_KEY: "hermes" });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/S3_ACCESS_KEY is still the development default/);
  });

  it("refuses SMTP_IGNORE_TLS in production", () => {
    const r = load({ SMTP_IGNORE_TLS: "true" });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/SMTP_IGNORE_TLS/);
  });

  it("refuses the development APP_DATABASE_URL default (it would target a dev host)", () => {
    const r = load({
      APP_DATABASE_URL: DEV_DEFAULT_APP_DATABASE_URL,
    });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/APP_DATABASE_URL is still the development default/);
  });

  it("refuses the development APP_DB_PASSWORD default", () => {
    const r = load({ APP_DB_PASSWORD: "app_runtime_dev_password" });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/APP_DB_PASSWORD is still the development default/);
  });

  it("refuses a localhost S3 endpoint in production", () => {
    for (const bad of ["http://127.0.0.1:9000", "http://localhost:9000"]) {
      const r = load({ S3_ENDPOINT: bad });
      expect(r.status, `accepted ${bad}`).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/S3_ENDPOINT must not point at localhost/);
    }
  });

  it("refuses a non-https APP_BASE_URL in production", () => {
    for (const bad of ["http://localhost:3000", "http://app.example.com"]) {
      const r = load({ APP_BASE_URL: bad });
      expect(r.status, `accepted ${bad}`).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/APP_BASE_URL must be an https origin/);
    }
  });

  it("the RUNTIME assertion ignores the build-phase exemption (closes the NEXT_PHASE bypass)", () => {
    // development defaults, plus NEXT_PHASE set exactly as the bypass would
    const devDefaults = {
      NEXT_PHASE: "phase-production-build",
      S3_ACCESS_KEY: "hermes",
      S3_SECRET_KEY: "hermes_dev_password",
      APP_BASE_URL: "http://localhost:3000",
      S3_ENDPOINT: "http://127.0.0.1:9000",
    };
    // the import-time guard IS exempt here - that is the documented build behaviour
    expect(load(devDefaults).status).toBe(0);
    // ...but the runtime assertion must still refuse
    const r = loadAndAssert(devDefaults);
    expect(r.status, "the NEXT_PHASE bypass still works at runtime").not.toBe(0);
    expect(r.stdout).toContain("REFUSED");
  });

  it("the runtime assertion passes on safe production configuration", () => {
    const r = loadAndAssert({});
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("NOT_REFUSED");
  });

  it("refuses the development DSN when APP_DATABASE_URL is left UNSET (this check must not be vacuous)", () => {
    // The guard used to compare against a placeholder constant that did not match the
    // schema default, so an unset APP_DATABASE_URL fell back to the dev DSN (dev host
    // + dev password) and BOOTED in production. Behavioural, so drift cannot hide.
    const r = load({ APP_DATABASE_URL: undefined });
    expect(r.status, "production booted on the development database DSN").not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/APP_DATABASE_URL/);
  });

  it("refuses a development DSN even when it is not byte-identical to the default", () => {
    // defence in depth against the constant drifting from the schema default again
    const r = load({
      APP_DATABASE_URL: "postgres://someone_else:app_runtime_dev_password@db.prod.internal:5432/dsar",
    });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/development password/);
  });

  it("guards the REQUEST path, which Next cannot suppress via NEXT_PHASE", () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
      NEXT_PHASE: "phase-production-build",
      S3_ACCESS_KEY: "hermes",
      S3_SECRET_KEY: "hermes_dev_password",
      APP_BASE_URL: "http://localhost:3000",
      S3_ENDPOINT: "http://127.0.0.1:9000",
    };
    // Next skips the instrumentation hook when NEXT_PHASE is the build phase, so the
    // boot guard is suppressible. Every request goes through route(), and that cannot be.
    const r = spawnSync(
      TSX,
      [
        "-e",
        'import("./src/server/http/handler.ts").then(async (m) => { const h = m.route(() => new Response("ok", { status: 200 })); const res = await h({ headers: { get: () => null } }, { params: Promise.resolve({}) }); console.log("STATUS", res.status); process.exit(res.status === 500 ? 0 : 1); });',
      ],
      { encoding: "utf8", env },
    );
    expect(r.status, `request path served instead of refusing:\n${r.stdout}${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("STATUS 500");
  });

  it("every long-lived entry point asserts the production config", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    // a future refactor must not silently drop an entry point
    for (const file of ["src/instrumentation.ts", "src/worker.ts", "src/server/http/handler.ts"]) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, `${file} no longer asserts the production config`).toContain(
        "assertProductionConfig",
      );
    }
  });

  it("refuses the DEVELOPMENT DATABASE_URL (the admin/superuser DSN) - FINDING B", () => {
    for (const bad of [
      undefined,
      DEV_DEFAULT_DATABASE_URL,
      // a production ADMIN DSN never points at loopback - same rule REDIS_URL/S3_ENDPOINT get
      "postgres://hermes:whatever@127.0.0.1:5432/hermes_dsar",
      "postgres://hermes:whatever@localhost:5432/hermes_dsar",
    ]) {
      const r = load({ DATABASE_URL: bad });
      expect(r.status, `accepted DATABASE_URL=${bad ?? "(unset)"}`).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/DATABASE_URL must be set explicitly/);
    }
  });

  it("refuses REDIS_URL that is unset, at its dev default, OR pointing at localhost - FINDING B", () => {
    // The dev default must be refused by VALUE as well as by absence. Guarding with
    // unset() alone let `REDIS_URL=redis://127.0.0.1:6379` boot production unguarded -
    // that was the residual the guardrail found, because these tests only covered unset.
    for (const bad of [undefined, DEV_DEFAULT_REDIS_URL, "redis://localhost:6379", "redis://127.0.0.1:6380"]) {
      const r = load({ REDIS_URL: bad });
      expect(r.status, `accepted REDIS_URL=${bad ?? "(unset)"}`).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/REDIS_URL must be an authenticated production endpoint/);
    }
  });

  it("refuses SMTP_HOST / SMTP_FROM that are unset OR at their dev defaults - FINDING B", () => {
    for (const [key, values, re_] of [
      ["SMTP_HOST", [undefined, DEV_DEFAULT_SMTP_HOST, "localhost"], /SMTP_HOST must be a production mail host/],
      ["SMTP_FROM", [undefined, DEV_DEFAULT_SMTP_FROM, "no-reply@anything.local"], /SMTP_FROM must be a production sender address/],
    ] as const) {
      for (const bad of values) {
        const r = load({ [key]: bad });
        expect(r.status, `accepted ${key}=${bad ?? "(unset)"}`).not.toBe(0);
        expect(`${r.stdout}${r.stderr}`).toMatch(re_);
      }
    }
  });

  it("refuses a missing or too-short SESSION_SECRET - requirement 8's cookie secret", () => {
    for (const bad of [undefined, "too-short"]) {
      const r = load({ SESSION_SECRET: bad });
      expect(r.status, `accepted SESSION_SECRET=${bad ?? "(unset)"}`).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/SESSION_SECRET must be set to at least 32 characters/);
    }
  });

  it("refuses the published development TOTP key in production - T-08", () => {
    const r = load({ TOTP_ENCRYPTION_KEY: DEV_DEFAULT_TOTP_KEY });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/TOTP_ENCRYPTION_KEY must be set to a real 32-byte base64 secret/);
  });

  it("refuses the development S3 bucket, owner role and mail-sink port by VALUE - L1", () => {
    // These three have development defaults that are genuinely wrong in production, so the
    // value matters, not just its absence. (S3_FORCE_PATH_STYLE / DB_POOL_MAX / SMTP_SECURE
    // are deliberately unset-only: their defaults are legitimate in production.)
    for (const [key, bad, re_] of [
      ["S3_BUCKET", "dsar-evidence", /S3_BUCKET must not be the development bucket name/],
      ["DB_OWNER_USER", "hermes", /DB_OWNER_USER must name the production owner role/],
      ["SMTP_PORT", "1025", /SMTP_PORT 1025 is the development mail sink/],
    ] as const) {
      const r = load({ [key]: bad });
      expect(r.status, `accepted ${key}=${bad}`).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(re_);
    }
  });

  it("refuses exotic loopback forms in DATABASE_URL/REDIS_URL - L2", () => {
    for (const bad of [
      "postgres://hermes:x@::1:5432/hermes_dsar",
      "postgres://hermes:x@0.0.0.0:5432/hermes_dsar",
      "postgres://hermes:x@localhost:5432/hermes_dsar",
    ]) {
      expect(load({ DATABASE_URL: bad }).status, `accepted ${bad}`).not.toBe(0);
    }
    for (const bad of [
      "redis://:password@localhost:6379",
      "redis://:password@::1:6379",
      "redis://0.0.0.0:6379",
      "redis://:password@127.0.0.1:6379",
    ]) {
      const r = load({ REDIS_URL: bad });
      expect(r.status, `accepted ${bad}`).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/REDIS_URL must be an authenticated production endpoint/);
    }
  });
});
