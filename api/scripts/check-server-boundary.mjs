#!/usr/bin/env node
/**
 * check-server-boundary — fails when a *client* module imports server-only code.
 *
 * Why a hand-rolled check instead of the `server-only` package: that package
 * throws outside Next's server runtime, which would break both the BullMQ worker
 * (tsx) and vitest, and both legitimately need db/storage/email.
 *
 * A client module is any file carrying the `"use client"` directive. Imports are
 * resolved through the `@/` alias AND relative paths, so `@/db/client` and
 * `../../db/client` are both caught, as are dynamic `import()` and `require()`.
 *
 * This check CAN fail. `tests/server-boundary.test.ts` runs it against a
 * fixture that violates the rule and asserts a non-zero exit, so a green run
 * here means something rather than nothing.
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

const IMPORT_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;

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

/** Pure: returns the violations in one file's text. */
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
  const violations = [];
  for (const file of files) {
    violations.push(...scanText(readFileSync(file, "utf8"), file, srcDir));
  }
  return { files: files.length, violations };
}

function main() {
  const argv = process.argv.slice(2);
  const quiet = argv.includes("--quiet");
  const srcFlag = argv.indexOf("--src");
  const srcDir =
    srcFlag !== -1 && argv[srcFlag + 1]
      ? resolve(argv[srcFlag + 1])
      : resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

  const { files, violations } = checkServerBoundary(srcDir);
  if (violations.length > 0) {
    console.error("Server-only modules imported into client components:");
    for (const v of violations) console.error(`  - ${v.file} imports ${v.spec}`);
    console.error(
      `\n${violations.length} violation(s). Move the server work behind a route handler or server action.`,
    );
    process.exit(1);
  }
  if (!quiet) {
    console.log(`server boundary OK (${files} files checked, 0 client -> server imports)`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
