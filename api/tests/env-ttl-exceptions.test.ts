import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const TSX = "node_modules/.bin/tsx";
const load = (raw: string) =>
  spawnSync(TSX, ["-e", 'import("./src/env.ts").then(() => console.log("LOADED"))'], {
    encoding: "utf8",
    env: { ...process.env, SIGNED_URL_TTL_EXCEPTIONS: raw },
  });

describe("SIGNED_URL_TTL_EXCEPTIONS must fail at STARTUP when misconfigured (guardrail F-4)", () => {
  it("refuses an exception above the hard cap", () => {
    const r = load(JSON.stringify([{ name: "big", purpose: "evidence", operation: "upload", ttlSeconds: 4000 }]));
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/ttlSeconds <= 3600/);
  });

  it("refuses a non-array value", () => {
    const r = load(JSON.stringify({ name: "not-an-array" }));
    expect(r.status).not.toBe(0);
  });

  it("loads cleanly when the config is valid", () => {
    const r = load(JSON.stringify([{ name: "ok", purpose: "evidence", operation: "upload", ttlSeconds: 1800 }]));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("LOADED");
  });
});
