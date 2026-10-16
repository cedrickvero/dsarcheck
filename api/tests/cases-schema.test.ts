/**
 * The cases entity, asserted against the DATABASE rather than the TypeScript.
 *
 * The CHECK constraints are the point: drizzle-kit emits none for a text-column "enum",
 * so the vocabulary was unconstrained until migration 0010 added them explicitly. Reading
 * them back out of pg_constraint is what catches a future drift between schema.ts and the
 * SQL - the same drift guard objects-schema.test.ts established for purpose.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { systemPool } from "@/db/client";
import { CASE_STATUSES, PRIORITIES, REQUEST_TYPES } from "@/db/schema";

let ready = false;
beforeAll(async () => {
  try { await systemPool.query("select 1"); ready = true; }
  catch (e) { throw new Error(`cases-schema setup failed - must not pass silently: ${String(e)}`); }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

async function checkDef(name: string): Promise<string> {
  const { rows } = await systemPool.query<{ def: string }>(
    `select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1`, [name],
  );
  if (!rows[0]) throw new Error(`constraint ${name} is missing`);
  return rows[0].def;
}

describe("T-07 cases schema", () => {
  it("RLS is ENABLED and FORCED on cases and case_number_seq", async () => {
    if (!ready) throw new Error("db not ready");
    const { rows } = await systemPool.query<{ relname: string; e: boolean; f: boolean }>(
      `select relname, relrowsecurity as e, relforcerowsecurity as f from pg_class
        where relname in ('cases','case_number_seq')`,
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) expect([r.relname, r.e, r.f]).toEqual([r.relname, true, true]);
  });

  it("status is CHECK-constrained to exactly the seven spec values", async () => {
    const def = await checkDef("cases_status_check");
    for (const s of CASE_STATUSES) expect(def).toContain(`'${s}'`);
    // and to nothing else
    const quoted = [...def.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(quoted.sort()).toEqual([...CASE_STATUSES].sort());
  });

  it("request_type and priority are constrained to their spec values", async () => {
    const rt = await checkDef("cases_request_type_check");
    expect([...rt.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()).toEqual([...REQUEST_TYPES].sort());
    const pr = await checkDef("cases_priority_check");
    expect([...pr.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()).toEqual([...PRIORITIES].sort());
  });

  it("the case number format is structural, not conventional", async () => {
    const def = await checkDef("cases_number_format_check");
    expect(def).toMatch(/DSAR/);
    expect(def).toMatch(/\[0-9\]\{4\}/);
    expect(def).toMatch(/\[0-9\]\{5\}/);
  });

  it("the two required indices and the per-workspace uniqueness exist", async () => {
    if (!ready) throw new Error("db not ready");
    const { rows } = await systemPool.query<{ indexname: string }>(
      `select indexname from pg_indexes where tablename = 'cases'`,
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toContain("cases_workspace_status_idx");
    expect(names).toContain("cases_workspace_received_idx");
    expect(names).toContain("cases_workspace_number_idx");
  });

  it("a value outside the vocabulary is REJECTED by the database", async () => {
    if (!ready) throw new Error("db not ready");
    // Proves the CHECK is load-bearing rather than decorative.
    await expect(
      systemPool.query(
        `insert into cases (org_id, workspace_id, case_number, request_type, priority, status, received_at, statutory_due_at)
         values (gen_random_uuid(), gen_random_uuid(), 'DSAR-2026-99999', 'Access', 'Normal', 'Not A Status', now(), now())`,
      ),
    ).rejects.toThrow(/cases_status_check|violates check constraint/i);
  });

  it("a malformed case number is REJECTED by the database", async () => {
    if (!ready) throw new Error("db not ready");
    await expect(
      systemPool.query(
        `insert into cases (org_id, workspace_id, case_number, request_type, priority, status, received_at, statutory_due_at)
         values (gen_random_uuid(), gen_random_uuid(), 'nonsense', 'Access', 'Normal', 'New', now(), now())`,
      ),
    ).rejects.toThrow(/cases_number_format_check|violates check constraint/i);
  });
});
