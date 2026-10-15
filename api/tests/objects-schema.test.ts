import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemDb, systemPool } from "@/db/client";
import { orgs, workspaces } from "@/db/schema";
import { PURPOSE_POLICY } from "@/server/storage/purpose";

/**
 * The objects table must carry the same tenant guarantees as R1, and the purpose
 * list in SQL must not drift from the allowlist in purpose.ts.
 *
 * Isolation reads run as app_tenant inside a transaction - never as the superuser,
 * which bypasses RLS unconditionally and would prove nothing. Each mutating attempt
 * uses its own fresh transaction so a refusal cannot be an artefact of an aborted one.
 */
const hasEnv = Boolean(process.env.DATABASE_URL && process.env.APP_DATABASE_URL);

describe.skipIf(!hasEnv)("objects table", () => {
  let admin: pg.Client;
  let ready = false;
  let orgId = "";
  let wsA = "";
  let wsB = "";
  const tag = `r2schema-${Date.now()}`;

  /** Run one statement as app_tenant with a tenant GUC, always rolled back. */
  async function asTenant<T>(
    workspaceId: string | null,
    sql: string,
    params: unknown[] = [],
    opts: { commit?: boolean } = {},
  ): Promise<{ ok: true; rows: unknown[] } | { ok: false; error: string }> {
    await admin.query("begin");
    try {
      await admin.query("set local role app_tenant");
      if (workspaceId !== null) {
        await admin.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
      }
      const res = await admin.query(sql, params);
      // Refusals are always rolled back. Setup writes may commit - otherwise the
      // follow-up reads could never see them.
      await admin.query(opts.commit ? "commit" : "rollback");
      return { ok: true, rows: res.rows };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    } finally {
      await admin.query("rollback").catch(() => {});
    }
  }

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: process.env.APP_DATABASE_URL });
    await admin.connect();
    try {
      await admin.query("select 1 from objects limit 1");
      ready = true;
    } catch {
      return;
    }
    const org = (
      await systemDb
        .insert(orgs)
        .values({ name: `${tag}-org` })
        .returning({ id: orgs.id })
    )[0]!;
    const a = (
      await systemDb
        .insert(workspaces)
        .values({ orgId: org.id, name: `${tag}-A` })
        .returning({ id: workspaces.id })
    )[0]!;
    const b = (
      await systemDb
        .insert(workspaces)
        .values({ orgId: org.id, name: `${tag}-B` })
        .returning({ id: workspaces.id })
    )[0]!;
    orgId = org.id;
    wsA = a.id;
    wsB = b.id;
  });

  afterAll(async () => {
    await admin?.end().catch(() => {});
    await systemPool.end().catch(() => {});
  });

  it("has RLS enabled AND forced", async () => {
    if (!ready) return;
    const row = (
      await systemDb.execute(
        `select relrowsecurity, relforcerowsecurity from pg_class where relname = 'objects'` as never,
      )
    ).rows[0] as { relrowsecurity: boolean; relforcerowsecurity: boolean };
    expect(row.relrowsecurity).toBe(true);
    expect(row.relforcerowsecurity).toBe(true);
  });

  it("has a tenant policy keyed on app.workspace_id", async () => {
    if (!ready) return;
    const rows = (
      await systemDb.execute(
        `select qual from pg_policies where tablename = 'objects'` as never,
      )
    ).rows as Array<{ qual: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => /app\.workspace_id/.test(r.qual))).toBe(true);
  });

  it("fails closed when no tenant is set", async () => {
    if (!ready) return;
    const res = await asTenant(null, "select count(*)::int as n from objects");
    expect(res.ok).toBe(true);
    if (res.ok) expect(((res.rows[0] as { n: number }) ?? { n: -1 }).n).toBe(0);
  });

  it("rejects a row whose key belongs to another tenant, even when the workspace matches", async () => {
    if (!ready) return;
    // workspace_id = wsA (so RLS passes) but the key says wsB: the CHECK must catch it
    const res = await asTenant(
      wsA,
      `insert into objects (org_id, workspace_id, object_key, purpose, content_type, uploader_actor_id)
       values ((select org_id from workspaces where id = $1), $1, $2, 'evidence', 'application/pdf', 't')
       returning id`,
      [wsA, `ws/${wsB}/evidence/7be1b6bf-bd8f-421e-a7c6-27d42d184ca9`],
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/objects_key_workspace_prefix/);
  });

  it("rejects a purpose outside the allowlist", async () => {
    if (!ready) return;
    const res = await asTenant(
      wsA,
      `insert into objects (org_id, workspace_id, object_key, purpose, content_type, uploader_actor_id)
       values ((select org_id from workspaces where id = $1), $1, $2, 'payroll', 'application/pdf', 't')
       returning id`,
      [wsA, `ws/${wsA}/evidence/7be1b6bf-bd8f-421e-a7c6-27d42d184ca9`],
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/objects_purpose_allowlist/);
  });

  it("rejects a row pointing at a nonexistent workspace (FK)", async () => {
    if (!ready) return;
    const ghost = "00000000-0000-4000-8000-000000000000";
    // GUC = ghost, so RLS is satisfied (workspace_id matches) and the FK is what fails
    const res = await asTenant(
      ghost,
      `insert into objects (org_id, workspace_id, object_key, purpose, content_type, uploader_actor_id)
       values ($1, $2, $3, 'evidence', 'application/pdf', 't')
       returning id`,
      [orgId, ghost, `ws/${ghost}/evidence/7be1b6bf-bd8f-421e-a7c6-27d42d184ca9`],
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/violates foreign key constraint/);
  });

  it("isolates tenants from each other on a real insert", async () => {
    if (!ready) return;
    const keyA = `ws/${wsA}/evidence/7be1b6bf-bd8f-421e-a7c6-27d42d184ca9`;
    const ins = await asTenant(
      wsA,
      `insert into objects (org_id, workspace_id, object_key, purpose, content_type, uploader_actor_id)
       values ((select org_id from workspaces where id = $1), $1, $2, 'evidence', 'application/pdf', 't')
       returning id`,
      [wsA, keyA],
      { commit: true },
    );
    expect(ins.ok).toBe(true);

    const own = await asTenant(wsA, "select count(*)::int as n from objects where object_key = $1", [keyA]);
    expect(own.ok && (own.rows[0] as { n: number }).n).toBe(1);

    const foreign = await asTenant(wsB, "select count(*)::int as n from objects where object_key = $1", [keyA]);
    expect(foreign.ok && (foreign.rows[0] as { n: number }).n).toBe(0);
  });

  it("keeps the SQL purpose allowlist in step with purpose.ts", async () => {
    if (!ready) return;
    // requires the migration + test rows, so run only once the table exists
    const rows = (
      await systemDb.execute(
        `select pg_get_constraintdef(oid) as def from pg_constraint
         where conrelid = 'objects'::regclass and conname = 'objects_purpose_allowlist'` as never,
      )
    ).rows as Array<{ def: string }>;
    expect(rows).toHaveLength(1);
    const def = rows[0]!.def;
    for (const purpose of Object.keys(PURPOSE_POLICY)) {
      expect(def, `SQL CHECK is missing the allowlisted purpose "${purpose}"`).toContain(`'${purpose}'`);
    }
    const inSql = [...def.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(new Set(inSql)).toEqual(new Set(Object.keys(PURPOSE_POLICY)));
  });

  it("refuses to let the application principal delete an object (guardrail F-1)", async () => {
    if (!ready) return;
    const key = `ws/${wsA}/evidence/2df1b6bf-2222-4333-8444-555555555555`;
    const ins = await asTenant(
      wsA,
      `insert into objects (org_id, workspace_id, object_key, purpose, content_type, uploader_actor_id)
       values ($1,$2,$3,'evidence','application/pdf','f1-test') returning id`,
      [orgId, wsA, key],
      { commit: true },
    );
    expect(ins.ok).toBe(true);

    const del = await asTenant(wsA, "delete from objects where object_key=$1", [key], { commit: true });
    expect(del.ok, "app_tenant was able to DELETE an object").toBe(false);
    expect(del.ok ? "" : del.error).toMatch(/permission denied/i);

    const still = await asTenant(wsA, "select count(*)::int n from objects where object_key=$1", [key]);
    const remaining = still.ok ? (still.rows[0] as { n: number } | undefined)?.n : undefined;
    expect(remaining, "the object was deleted despite the refusal").toBe(1);
  });

});
