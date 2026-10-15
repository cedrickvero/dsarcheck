#!/usr/bin/env node
/**
 * check-server-boundary — two static guards over `src/`:
 *
 *   RULE 1  no client module may import server-only code.
 *           A client module is any file carrying the "use client" directive.
 *           Imports are resolved through the `@/` alias AND relative paths, so
 *           `@/db/client` and `../../db/client` are both caught, as are dynamic
 *           `import()` and `require()` forms.
 *
 *   RULE 2  nothing may import the privileged database handles (`systemDb`,
 *           `systemPool`) outside `src/db/client.ts`, where they are defined.
 *           They connect with the admin/owner DSN, which BYPASSES row-level
 *           security. They exist for migration and verification scripts; one
 *           accidental import in a request path would silently disable tenant
 *           isolation. Static, so it cannot be forgotten at runtime.
 *
 * Why a hand-rolled check instead of the `server-only` package: that package
 * throws outside Next's server runtime, which would break both the BullMQ worker
 * (tsx) and vitest, and both legitimately need db/storage/email.
 *
 * This check CAN fail. `tests/server-boundary.test.ts` runs it against fixtures
 * that violate both rules and asserts a non-zero exit, so a green run here means
 * something rather than nothing.
 *
 * Usage: node scripts/check-server-boundary.mjs [--src <dir>] [--quiet]
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Server-only areas, expressed relative to the directory that CONTAINS src/. */
export const SERVER_MODULES = [
  "src/server",
  "src/db",
  "src/env",
  "src/auth",
  "src/jobs",
  "src/lib/s3",
  "src/lib/mailer",
];

/** Privileged handles that must never leave db/client.ts. */
export const PRIVILEGED_EXPORTS = ["systemDb", "systemPool"];

const IMPORT_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;
const NAMED_IMPORT_RE = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

/** A module is a client module iff it opts in with the directive. */
export function isClientModule(text) {
  return /^\s*["']use client["']\s*;?/m.test(text);
}

function resolveSpecifier(spec, filePath, srcDir) {
  if (spec.startsWith("@/")) return join(srcDir, spec.slice(2));
  if (spec.startsWith("./") || spec.startsWith("../")) {
    return resolve(dirname(filePath), spec);
  }
  return null; // bare package specifier — not ours to police
}

function isServerPath(absPath, srcDir) {
  const rel = relative(dirname(srcDir), absPath).split("\\").join("/");
  return SERVER_MODULES.some((m) => rel === m || rel === `${m}.ts` || rel.startsWith(`${m}/`));
}

/** RULE 1 — pure: violations in one file's text. */
export function scanText(text, filePath, srcDir) {
  const violations = [];
  if (!isClientModule(text)) return violations;
  for (const match of text.matchAll(IMPORT_RE)) {
    const spec = match[1];
    const abs = resolveSpecifier(spec, filePath, srcDir);
    if (abs && isServerPath(abs, srcDir)) violations.push({ file: filePath, spec });
  }
  return violations;
}

/** RULE 2 — pure: privileged handles imported outside their own module. */
export function scanPrivilegedImports(text, filePath, srcDir) {
  const violations = [];
  const self = `${srcDir}/db/client.ts`;
  if (resolve(filePath) === resolve(self)) return violations;
  for (const match of text.matchAll(NAMED_IMPORT_RE)) {
    const names = match[1]
      .split(",")
      .map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim());
    for (const name of PRIVILEGED_EXPORTS) {
      if (names.includes(name)) violations.push({ file: filePath, spec: name });
    }
  }
  return violations;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mts|js|jsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

export function checkServerBoundary(srcDir) {
  const files = walk(srcDir);
  const boundaries = [];
  const privileged = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    boundaries.push(...scanText(text, file, srcDir));
    privileged.push(...scanPrivilegedImports(text, file, srcDir));
  }
  return { files: files.length, boundaries, privileged };
}

function main() {
  const argv = process.argv.slice(2);
  const quiet = argv.includes("--quiet");
  const srcFlag = argv.indexOf("--src");
  const srcDir =
    srcFlag !== -1 && argv[srcFlag + 1]
      ? resolve(argv[srcFlag + 1])
      : resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

  const { files, boundaries, privileged } = checkServerBoundary(srcDir);
  const failed = boundaries.length + privileged.length;

  if (failed > 0) {
    if (boundaries.length > 0) {
      console.error("Server-only modules imported into client components:");
      for (const v of boundaries) console.error(`  - ${v.file} imports ${v.spec}`);
    }
    if (privileged.length > 0) {
      console.error(
        `Privileged database handles imported outside db/client.ts ` +
          `(these BYPASS row-level security):`,
      );
      for (const v of privileged) console.error(`  - ${v.file} imports ${v.spec}`);
    }
    console.error(`\n${failed} violation(s).`);
    process.exit(1);
  }
  if (!quiet) {
    console.log(
      `server boundary OK (${files} files checked, 0 client -> server imports, ` +
        `0 privileged-handle imports)`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
