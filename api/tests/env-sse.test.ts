import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Selecting KMS encryption without naming a key must stop the process at startup.
 * env.ts calls parse() at import time, so importing it with a bad combination is
 * exactly what a boot does - which is what this asserts. A guard that only fired on
 * the first upload would leave a misconfigured server running and serving.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(HERE, "..");

function loadEnv(extra: Record<string, string>) {
  return spawnSync("npx", ["tsx", "-e", 'import("./src/env.ts")'], {
    cwd: API_ROOT,
    encoding: "utf8",
    env: { ...process.env, ...extra },
    timeout: 60_000,
  });
}

describe("S3 SSE configuration guard", () => {
  it("fails loudly at startup when aws:kms is selected without a key", () => {
    const run = loadEnv({ S3_SSE_ALGORITHM: "aws:kms", S3_KMS_KEY_ID: "" });
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    expect(run.status).not.toBe(0);
    expect(output).toMatch(/S3_KMS_KEY_ID/);
  });

  it("starts when aws:kms is paired with a key", () => {
    const run = loadEnv({
      S3_SSE_ALGORITHM: "aws:kms",
      S3_KMS_KEY_ID: "arn:aws:kms:eu-west-1:000000000000:key/test-only",
    });
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    expect(output).not.toMatch(/S3_SSE_ALGORITHM=aws:kms requires/);
  });

  it("starts with the default AES256 and no key", () => {
    const run = loadEnv({ S3_SSE_ALGORITHM: "AES256", S3_KMS_KEY_ID: "" });
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    expect(output).not.toMatch(/requires S3_KMS_KEY_ID/);
  });
});
