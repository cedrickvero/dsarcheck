import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const TSX = "node_modules/.bin/tsx";
const APP_DB = process.env.APP_DATABASE_URL ?? "postgres://app_runtime:x@127.0.0.1:5432/dsar";

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
    SMTP_IGNORE_TLS: "false",
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

describe("production config guard (R3)", () => {
  it("starts with safe production configuration", () => {
    const r = load({});
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("LOADED");
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
      APP_DATABASE_URL: "postgres://app_runtime:***@hermes_dsar_postgres:5432/hermes_dsar",
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
});
