#!/usr/bin/env node
/**
 * Fails if a client component ("use client") imports a server-only module.
 *
 * Database, authorization, audit, queue, storage and email logic must never
 * reach the browser bundle. See README "Server boundary".
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

const SERVER_MODULES = ["@/server/", "@/db/", "@/auth/", "@/jobs/", "@/lib/s3", "@/lib/mailer"];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const violations = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (!/^\s*["']use client["']\s*;?/m.test(text)) continue;
  for (const match of text.matchAll(/from\s+["']([^"']+)["']/g)) {
    const spec = match[1];
    if (SERVER_MODULES.some((prefix) => spec.startsWith(prefix))) {
      violations.push(`${relative(ROOT, file)} imports ${spec}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Server modules imported into client components:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log(`server boundary OK (${files.length} files checked, 0 client -> server imports)`);
