/**
 * "No password storage" is a claim about the whole system, so it is checked against the
 * schema, the SQL, the dependencies and the database itself - not by reading one file.
 */
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { systemPool } from "@/db/client";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "graphify-out") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

afterAll(async () => { await systemPool.end().catch(() => {}); });

describe("T-08 no password authentication exists", () => {
  it("no schema column is named like a password", () => {
    const schema = readFileSync("src/db/schema.ts", "utf8");
    const columns = schema.match(/\w+\("(\w+)"/g) ?? [];
    const offenders = columns.filter((c) => /password|passwd|pwd|bcrypt|argon/i.test(c));
    expect(offenders).toEqual([]);
  });

  it("no migration creates a password column or table", () => {
    const dir = "drizzle/migrations";
    const bad: string[] = [];
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(dir, f), "utf8");
      for (const line of sql.split("\n")) {
        if (/CREATE\s+TABLE[^;]*password/i.test(line)) bad.push(`${f}: ${line.trim()}`);
        if (/^\s*"?\w*password\w*"?\s+(text|varchar|bytea|char)/i.test(line)) bad.push(`${f}: ${line.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no password hashing dependency is installed", () => {
    const pkg = readFileSync("package.json", "utf8");
    expect(pkg).not.toMatch(/bcrypt|argon2|scrypt-js|password-hash/i);
  });

  it("no source file implements a password reset or verification flow", () => {
    const files = walk("src").filter((f) => /\.(ts|tsx)$/.test(f));
    const offenders = files.filter((f) => {
      const body = readFileSync(f, "utf8");
      return /passwordReset|resetPassword|verifyPassword|hashPassword|password_hash/i.test(body);
    });
    expect(offenders).toEqual([]);
  });

  it("the live database has no password-like column", async () => {
    const { rows } = await systemPool.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and (column_name ilike '%password%' or column_name ilike '%secret%')`,
    );
    // secret_* columns belong to mfa_totp and hold CIPHERTEXT, never a password.
    const offending = rows.filter((r) => !r.column_name.startsWith("secret_"));
    expect(offending).toEqual([]);
  });
});
