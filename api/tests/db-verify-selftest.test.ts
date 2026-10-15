import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The invariant gate is only worth running if it can actually fail.
 *
 * `--self-test` builds a probe table that deliberately lacks the R2 object
 * invariants and asserts the SAME checks report every one of them as missing. If a
 * check passes on a table that plainly violates it, the self-test itself exits
 * non-zero - so this test fails when the gate goes blind.
 *
 * Needs the admin DSN; skipped when it is absent.
 */
const ADMIN = process.env.DATABASE_URL;
const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKER = resolve(HERE, "..", "scripts", "db-verify-invariants.mjs");

describe.skipIf(!ADMIN)("db:verify falsification self-test", () => {
  it("detects a table that is missing RLS, the key CHECK, the FKs and uniqueness", () => {
    expect(existsSync(CHECKER)).toBe(true);
    const run = spawnSync("node", [CHECKER, "--self-test"], {
      encoding: "utf8",
      env: { ...process.env },
      cwd: join(HERE, ".."),
    });
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    expect(output).toContain("self-test OK");
    expect(run.status).toBe(0);
  });
});
