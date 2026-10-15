import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The boundary checker is only worth having if it can actually fail. The
 * previous version could not: it scanned for "use client" files, found none,
 * and therefore always passed. These cases are the positive control.
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
  it("FAILS on a client component importing @/env (positive control)", () => {
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
      "app/upload/page.tsx": '"use client";\nimport { signUpload } from "@/lib/s3";\n',
    });
    expect(runChecker(root).code).toBe(1);
  });

  it("PASSES when the same import sits in a server module", () => {
    const root = fixture({
      "server/db/thing.ts": 'import { db } from "@/db/client";\nexport const t = db;\n',
    });
    expect(runChecker(root).code).toBe(0);
  });

  it("PASSES the real tree (no client component imports server code)", () => {
    const { code, output } = runChecker(API_ROOT);
    expect(code).toBe(0);
    expect(output).toContain("server boundary OK");
  });
});
