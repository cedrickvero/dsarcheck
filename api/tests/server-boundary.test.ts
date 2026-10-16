import { PRIVILEGED_IMPORT_ALLOWLIST, scanPrivilegedImports } from "../scripts/check-server-boundary.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The boundary checker is only worth having if it can actually fail. The
 * previous version could not: it scanned for "use client" files, found none,
 * and therefore always passed. These cases are the positive control, covering
 * both rules.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(HERE, "..");
const CHECKER = join(API_ROOT, "scripts", "check-server-boundary.mjs");

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "boundary-"));
  const src = join(root, "src");
  for (const [rel, content] of Object.entries(files)) {
    const full = join(src, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

function runChecker(root: string): { code: number; output: string } {
  try {
    const output = execFileSync("node", [CHECKER, "--src", join(root, "src")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("server boundary check", () => {
  describe("rule 1 - client modules must not import server code", () => {
    it("FAILS on a client component importing @/env", () => {
      const root = fixture({
        "app/page.tsx":
          '"use client";\nimport { env } from "@/env";\nexport default () => env.PORT;\n',
      });
      const { code, output } = runChecker(root);
      expect(code).toBe(1);
      expect(output).toContain("@/env");
    });

    it("FAILS on a relative server import and on a dynamic import", () => {
      const root = fixture({
        "app/deep/x.tsx":
          '"use client";\nconst a = () => import("@/db/client");\nconst b = require("../../db/client");\n',
      });
      const { code, output } = runChecker(root);
      expect(code).toBe(1);
      expect(output).toContain("@/db/client");
      expect(output).toContain("../../db/client");
    });

    it("FAILS when a client component reaches storage", () => {
      const root = fixture({
        "app/upload/page.tsx":
          '"use client";\nimport { uploadServerSideEncryption } from "@/server/storage/s3Client";\n',
      });
      expect(runChecker(root).code).toBe(1);
    });

    it("PASSES when the same import sits in a server module", () => {
      const root = fixture({
        "server/db/thing.ts": 'import { db } from "@/db/client";\nexport const t = db;\n',
      });
      expect(runChecker(root).code).toBe(0);
    });
  });

  describe("rule 2 - privileged handles must not leave db/client.ts", () => {
    it("FAILS when a route imports systemDb", () => {
      const root = fixture({
        "app/api/cases/route.ts":
          'import { systemDb } from "@/db/client";\nexport const GET = () => systemDb;\n',
      });
      const { code, output } = runChecker(root);
      expect(code).toBe(1);
      expect(output).toContain("systemDb");
    });

    it("FAILS on systemPool even in a server module", () => {
      const root = fixture({
        "server/db/helper.ts": 'import { systemPool } from "@/db/client";\nexport const p = systemPool;\n',
      });
      expect(runChecker(root).code).toBe(1);
    });

    it("PASSES when db/client.ts imports its own privileged handles", () => {
      const root = fixture({
        "db/client.ts": "const systemPool = 1;\nconst systemDb = 2;\nexport { systemPool, systemDb };\n",
      });
      expect(runChecker(root).code).toBe(0);
    });

    it("PASSES the unprivileged handle in a server module", () => {
      const root = fixture({
        "server/db/thing.ts": 'import { db } from "@/db/client";\nexport const t = db;\n',
      });
      expect(runChecker(root).code).toBe(0);
    });
  });

  it("PASSES the real tree", () => {
    const { code, output } = runChecker(API_ROOT);
    expect(code).toBe(0);
    expect(output).toContain("server boundary OK");
  });
});


/**
 * The privileged-handle allowlist, and the proof that it cannot widen by accident.
 *
 * src/db/seed.ts must import systemDb/systemPool: creating the first org and workspace
 * is impossible under RLS, because a tenant policy needs a tenant that does not exist
 * yet. Everything else must fail. The near-miss cases below are the point - a prefix or
 * directory exemption would let a future file inherit the exemption silently.
 */
describe("privileged-handle allowlist (T-07)", () => {
  const srcDir = join(process.cwd(), "src");
  const importText = 'import { systemDb, systemPool } from "@/db/client";\n';

  it("names exactly one file, so widening it is a visible edit", () => {
    expect(PRIVILEGED_IMPORT_ALLOWLIST).toEqual(["src/db/seed.ts"]);
  });

  it("ALLOWS the seed to import the privileged handles", () => {
    expect(scanPrivilegedImports(importText, join(srcDir, "db/seed.ts"), srcDir)).toEqual([]);
  });

  it("REFUSES any other file - server module, route, or component", () => {
    for (const rel of [
      "server/cases/query.ts",
      "server/cases/create.ts",
      "server/http/handler.ts",
      "app/app/cases/page.tsx",
      "db/schema.ts",
    ]) {
      const v = scanPrivilegedImports(importText, join(srcDir, rel), srcDir);
      // TWO handles in the fixture, so two violations - one per handle.
      expect(v.length, `${rel} was allowed to import a privileged handle`).toBe(2);
    }
  });

  it("cannot be widened by a near-miss name", () => {
    for (const rel of ["db/seed-extra.ts", "db/seed.ts.bak", "db/seed/extra.ts", "db/seedx.ts"]) {
      const v = scanPrivilegedImports(importText, join(srcDir, rel), srcDir);
      expect(v.length, `${rel} inherited the exemption`).toBe(2);
    }
  });

  it("still refuses the seed if it stops being the seed path", () => {
    const v = scanPrivilegedImports(importText, join(srcDir, "server/db/seed.ts"), srcDir);
    expect(v.length).toBe(2);
  });
});
