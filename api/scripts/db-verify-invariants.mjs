#!/usr/bin/env node
/**
 * db-verify-invariants — asserts the R1 security invariants against the LIVE
 * database and exits non-zero if any of them is missing.
 *
 * Wired into `npm run db:migrate`, so migrating and enforcing are the same
 * action: a database that has drifted can no longer masquerade as migrated.
 *
 * Covers: least-privilege runtime role, forced RLS + a policy on every
 * multi-tenant table, the append-only row trigger AND the TRUNCATE guard,
 * tenant-integrity foreign keys, absence of TRUNCATE privilege, and
 * fail-closed behaviour when no tenant is set.
 */
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("db-verify-invariants: DATABASE_URL is not set");
  process.exit(2);
}

const results = [];
const check = (cond, name, detail = "") =>
  results.push({ pass: Boolean(cond), name, detail });

const c = new pg.Client({ connectionString: url });
await c.connect();
const q = async (text, params) => (await c.query(text, params)).rows;

try {
  // 1 · the runtime role must not be privileged in any way
  const roles = await q(
    `select rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
       from pg_roles where rolname in ('app_runtime','app_tenant')`,
  );
  const rt = roles.find((r) => r.rolname === "app_runtime");
  check(rt, "role app_runtime exists");
  if (rt) {
    check(rt.rolsuper === false, "app_runtime is not a superuser");
    check(rt.rolbypassrls === false, "app_runtime has NOBYPASSRLS");
    check(
      rt.rolcreatedb === false && rt.rolcreaterole === false,
      "app_runtime cannot create databases or roles",
    );
  }
  const mem = await q(
    `select 1 from pg_auth_members m
       join pg_roles r on r.oid = m.member
       join pg_roles g on g.oid = m.roleid
      where r.rolname = 'app_runtime' and g.rolname = 'app_tenant'`,
  );
  check(mem.length === 1, "app_runtime is a member of app_tenant");

  // 2 · RLS must be enabled AND forced on every multi-tenant table
  const tables = ["audit_events", "orgs", "workspaces"];
  const rls = await q(
    `select relname, relrowsecurity, relforcerowsecurity from pg_class
      where relname = any($1) and relkind = 'r'`,
    [tables],
  );
  for (const t of tables) {
    const r = rls.find((x) => x.relname === t);
    check(r && r.relrowsecurity === true, `RLS enabled on ${t}`);
    check(r && r.relforcerowsecurity === true, `RLS FORCED on ${t} (owner not exempt)`);
  }

  // 3 · every RLS table must actually have a policy
  const pol = await q(
    `select tablename, count(*)::int as n from pg_policies
      where schemaname = 'public' and tablename = any($1) group by 1`,
    [tables],
  );
  for (const t of tables) {
    const p = pol.find((x) => x.tablename === t);
    check(p && p.n > 0, `tenant policy present on ${t}`, p ? `${p.n} policy/policies` : "none");
  }

  // 4 · append-only needs BOTH the row trigger and the statement-level guard
  const trg = await q(
    `select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as def
       from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and c.relname = 'audit_events'`,
  );
  const rowGuard = trg.find((t) => /UPDATE/i.test(t.def) && /DELETE/i.test(t.def));
  const truncGuard = trg.find((t) => /TRUNCATE/i.test(t.def));
  check(
    rowGuard && rowGuard.tgenabled === "O",
    "audit_events: BEFORE UPDATE/DELETE row trigger enabled",
  );
  check(
    truncGuard && truncGuard.tgenabled === "O",
    "audit_events: BEFORE TRUNCATE guard enabled (B2)",
  );

  // 5 · tenant-integrity + attribution constraints
  const cons = await q(
    `select conname from pg_constraint where conrelid = 'audit_events'::regclass`,
  );
  const names = cons.map((x) => x.conname);
  for (const n of ["audit_events_workspace_fk", "audit_events_org_fk"]) {
    check(names.includes(n), `constraint ${n} present (B6)`);
  }
  check(
    names.includes("audit_events_attribution_present"),
    "constraint audit_events_attribution_present present",
  );

  // 6 · the runtime role must not hold TRUNCATE
  const priv = await q(
    `select has_table_privilege('app_runtime','audit_events','TRUNCATE') as t`,
  );
  check(priv[0]?.t === false, "app_runtime has no TRUNCATE on audit_events");

  // 7 · fail closed: with no tenant set the table must look empty, not full
  await c.query("begin");
  await c.query("set local role app_tenant");
  await c.query("select set_config('app.workspace_id','',true)");
  const leak = (await c.query("select count(*)::int as n from audit_events")).rows[0].n;
  await c.query("rollback");
  check(leak === 0, "RLS fails closed when app.workspace_id is unset", `saw ${leak} row(s)`);

  // 8 · TRUNCATE must actually be refused at runtime
  let truncated = false;
  try {
    await c.query("begin");
    await c.query("set local role app_tenant");
    await c.query("truncate audit_events");
    await c.query("rollback");
    truncated = true;
  } catch {
    await c.query("rollback").catch(() => {});
  }
  check(!truncated, "TRUNCATE on audit_events is rejected");

  // 9 · historical FK violations are reported, not fatal (the FKs are NOT VALID)
  const orphans = (
    await c.query(
      `select count(*)::int as n from audit_events a
         left join workspaces w on w.id = a.workspace_id where w.id is null`,
    )
  ).rows[0].n;
  if (orphans > 0) {
    console.warn(
      `  ! ${orphans} historical audit row(s) reference a workspace that no longer exists (FK added NOT VALID)`,
    );
  }
} finally {
  await c.end().catch(() => {});
}

const failed = results.filter((r) => !r.pass);
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
}
console.log(
  `\ndb-verify-invariants: ${results.length - failed.length}/${results.length} invariants hold`,
);
if (failed.length) {
  console.error(`FAILED: ${failed.length} invariant(s) not satisfied`);
  process.exit(1);
}
