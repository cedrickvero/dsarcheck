#!/usr/bin/env node
/**
 * db-verify-invariants — asserts the R1 security invariants against the LIVE
 * database and exits non-zero if any of them is missing.
 *
 * Wired into `npm run db:migrate`, so migrating and enforcing are the same
 * action: a database that has drifted can no longer masquerade as migrated.
 *
 * Two connections are required to prove the controls honestly:
 *   - the admin DSN (DATABASE_URL) reads catalogs and checks policy structure;
 *   - the application DSN (APP_DATABASE_URL) proves the APP's own principal is
 *     least-privilege. Catalog checks alone cannot catch a superuser login with
 *     a reversible `SET ROLE` layered on top — that is exactly the fail-open
 *     shape this asserts against.
 */
import pg from "pg";

const adminDsn = process.env.DATABASE_URL;
if (!adminDsn) {
  console.error("db-verify-invariants: DATABASE_URL is not set");
  process.exit(2);
}
const appDsn = process.env.APP_DATABASE_URL;
const adminUser = process.env.DB_OWNER_USER || "hermes";


/**
 * R2 object-table invariants, parameterised by table name so the self-test can run
 * exactly these checks against a probe table that is missing them.
 * Returns the invariant names that FAILED.
 */
async function checkObjectsTable(conn, table, { transactional = true } = {}) {
  // Returns its own results rather than writing into the module-level recorder, so
  // it can be called from the self-test before those helpers exist.
  const out = [];
  const say = (pass, name, detail = "") => out.push({ pass, name, detail });

  const rls = (await conn.query(
    `select relrowsecurity, relforcerowsecurity from pg_class where relname = $1 and relkind = 'r'`,
    [table],
  )).rows[0];
  say(!!rls && rls.relrowsecurity === true, `RLS enabled on ${table}`);
  say(!!rls && rls.relforcerowsecurity === true, `RLS FORCED on ${table} (owner not exempt)`);

  const pol = (await conn.query(
    `select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = $1`,
    [table],
  )).rows[0];
  say(!!pol && pol.n > 0, `tenant policy present on ${table}`, pol ? `${pol.n} policy/policies` : "none");

  const cons = (await conn.query(
    `select conname from pg_constraint where conrelid = $1::regclass`,
    [`public.${table}`],
  )).rows.map((r) => r.conname);
  say(cons.includes("objects_key_workspace_prefix"), `${table}: key/workspace CHECK present`);
  say(cons.includes("objects_purpose_allowlist"), `${table}: purpose allowlist CHECK present`);
  say(cons.includes("objects_workspace_fk"), `${table}: workspace FK present`);
  say(cons.includes("objects_org_fk"), `${table}: org FK present`);

  const uniqueKey = (await conn.query(
    `select 1 from pg_constraint where conrelid = $1::regclass and contype = 'u'`,
    [`public.${table}`],
  )).rows.length;
  say(uniqueKey > 0, `${table}: object_key is unique`);

  // F-1: the app principal must not hold DELETE. Deleting a DSAR object is a
  // destructive action requiring human approval (R4); until that approved path
  // exists the privilege must be ABSENT, not merely discouraged.
  // Asserted for BOTH principals: app_runtime is a member of app_tenant, so a stray
  // grant to either role is a real hole, and migration 0006 had to revoke both.
  for (const principal of ["app_runtime", "app_tenant"]) {
    const canDelete = (
      await conn.query(`select has_table_privilege($1, $2, 'DELETE') as can`, [principal, table])
    ).rows[0].can;
    say(
      !canDelete,
      `${table}: DELETE withheld from ${principal}`,
      canDelete ? `${principal} CAN delete rows` : "",
    );
  }

  // and the table must fail closed when no tenant is set. `transactional: false` is
  // for the self-test, where the probe already lives inside the caller's transaction
  // and opening a nested one would roll it back mid-function (guardrail NF-6).
  if (transactional) {
    await conn.query("begin");
    try {
      await conn.query("set local role app_tenant");
      const n = (await conn.query(`select count(*)::int as n from "${table}"`)).rows[0].n;
      say(n === 0, `${table}: RLS fails closed when app.workspace_id is unset`, `saw ${n} row(s)`);
    } finally {
      await conn.query("rollback").catch(() => {});
    }
  } else {
    await conn.query("set role app_tenant");
    try {
      const n = (await conn.query(`select count(*)::int as n from "${table}"`)).rows[0].n;
      say(n === 0, `${table}: RLS fails closed when app.workspace_id is unset`, `saw ${n} row(s)`);
    } finally {
      await conn.query("reset role").catch(() => {});
    }
  }

  return out;
}


/**
 * Falsification self-test — proves these checks CAN fail.
 *
 * Creates a probe table inside a transaction that deliberately omits every R2
 * invariant, runs the SAME check functions against it, and asserts each one is
 * reported as a failure. If a check passes on a table that plainly violates it, the
 * check is vacuous and this exits non-zero. Rolls back, leaving nothing behind.
 *
 * Run: node scripts/db-verify-invariants.mjs --self-test
 */
async function runSelfTest() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("--self-test needs DATABASE_URL (admin DSN)");
    process.exit(2);
  }
  const conn = new pg.Client({ connectionString: url });
  await conn.connect();
  try {
    // The probe lives inside a transaction so a hard kill cannot leave a
    // DELETE-granted table behind, and the fail-closed read opts out of nesting.
    await conn.query("drop table if exists objects_probe");
    await conn.query("begin");
    await conn.query(`create table objects_probe (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null,
      object_key text not null,
      purpose text not null
    )`);
    // deliberately: a row a GUC-less read CAN see, and DELETE granted to the app
    // principal - so both new checks have something real to fail against
    await conn.query(
      `insert into objects_probe (workspace_id, object_key, purpose)
       values (gen_random_uuid(), 'ws/probe/evidence/x', 'evidence')`,
    );
    await conn.query("grant delete on objects_probe to app_runtime, app_tenant");
    const probeFails = (await checkObjectsTable(conn, "objects_probe", { transactional: false }))
      .filter((r) => !r.pass)
      .map((r) => r.name);
    await conn.query("rollback");

    const expected = [
      "RLS enabled on objects_probe",
      "RLS FORCED on objects_probe (owner not exempt)",
      "tenant policy present on objects_probe",
      "objects_probe: key/workspace CHECK present",
      "objects_probe: purpose allowlist CHECK present",
      "objects_probe: workspace FK present",
      "objects_probe: org FK present",
      "objects_probe: object_key is unique",
      "objects_probe: DELETE withheld from app_runtime",
      "objects_probe: DELETE withheld from app_tenant",
      "objects_probe: RLS fails closed when app.workspace_id is unset",
    ];
    const missed = expected.filter((name) => !probeFails.includes(name));
    if (missed.length > 0) {
      console.error(`self-test FAILED - a broken table was not detected by: ${missed.join(", ")}`);
      process.exit(1);
    }
    console.log(
      `self-test OK - all ${expected.length} R2 object checks correctly failed against a deliberately broken table`,
    );
  } catch (error) {
    await conn.query("drop table if exists objects_probe").catch(() => {});
    throw error;
  } finally {
    await conn.end().catch(() => {});
  }
}

const results = [];
const check = (cond, name, detail = "") =>
  results.push({ pass: Boolean(cond), name, detail });

if (process.argv.includes("--self-test")) {
  await runSelfTest();
  process.exit(0);
}

const admin = new pg.Client({ connectionString: adminDsn });
await admin.connect();
const q = async (text, params) => (await admin.query(text, params)).rows;

try {
  // 1 · the runtime role must not be privileged in any way
  const roles = await q(
    `select rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin
       from pg_roles where rolname in ('app_runtime','app_tenant')`,
  );
  const rt = roles.find((r) => r.rolname === "app_runtime");
  check(rt, "role app_runtime exists");
  if (rt) {
    check(rt.rolsuper === false, "app_runtime is not a superuser");
    check(rt.rolbypassrls === false, "app_runtime has NOBYPASSRLS");
    check(rt.rolcanlogin === true, "app_runtime can LOG IN (a session role, not just SET ROLE)");
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
  const tables = ["audit_events", "cases", "case_systems", "case_files", "redaction_tokens", "evidence_packs", "memberships", "signed_links", "orgs", "workspaces"];
// `objects` is verified by checkObjectsTable below, which also asserts the R2
// constraints - keeping it out of this list avoids printing each check twice.
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

  // memberships is the ONE org-scoped table: its policy must read app.org_id (a user sees
  // their org's roster), not app.workspace_id. A copy-paste workspace-scoped policy would
  // still "have a policy" above but silently break the agency enumeration scope.
  const membershipsPol = await q(
    `select qual from pg_policies where schemaname = 'public' and tablename = 'memberships' limit 1`,
  );
  const membershipsQual = membershipsPol[0]?.qual ?? "";
  check(
    /app\.org_id/.test(membershipsQual) && !/app\.workspace_id/.test(membershipsQual),
    "memberships policy is org-scoped (reads app.org_id, not app.workspace_id)",
    membershipsQual,
  );

  // Migration 0029: the session resolve decouples the user read from the workspace GUC
  // via users_actor_lookup (id = app.actor_id). If that policy is dropped, a session whose
  // active workspace differs from the user's home workspace can no longer resolve its own
  // user row, and the workspace switcher silently breaks sign-in.
  const usersActorPol = await q(
    `select qual from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'users_actor_lookup' limit 1`,
  );
  check(
    /app\.actor_id/.test(usersActorPol[0]?.qual ?? ""),
    "users_actor_lookup policy reads app.actor_id (session user-read is workspace-independent)",
    usersActorPol[0]?.qual ?? "absent",
  );

  // Migration 0026 ties memberships(workspace_id, org_id) to workspaces(id, org_id): the
  // composite FK (and its prerequisite unique constraint) make an (org A, workspace of org B)
  // row structurally impossible. Assert BOTH exist so a dropped or failed apply is caught.
  const membershipFk = await q(
    `select conname from pg_constraint where conrelid = 'memberships'::regclass and contype = 'f' and conname = 'memberships_workspace_org_fk'`,
  );
  check(
    membershipFk.length === 1,
    "memberships composite FK (workspace_id, org_id) -> workspaces(id, org_id) exists",
    membershipFk.map((r) => r.conname).join(",") || "absent",
  );
  const workspacesUnique = await q(
    `select conname from pg_constraint where conrelid = 'workspaces'::regclass and conname = 'workspaces_id_org_id_unique'`,
  );
  check(
    workspacesUnique.length === 1,
    "workspaces unique (id, org_id) exists (prerequisite for the memberships composite FK)",
    workspacesUnique.map((r) => r.conname).join(",") || "absent",
  );

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
  await admin.query("begin");
  await admin.query("set local role app_tenant");
  await admin.query("select set_config('app.workspace_id','',true)");
  const leak = (await admin.query("select count(*)::int as n from audit_events")).rows[0].n;
  await admin.query("rollback");
  check(leak === 0, "RLS fails closed when app.workspace_id is unset", `saw ${leak} row(s)`);

  // 8 · TRUNCATE must actually be refused at runtime
  let truncated = false;
  try {
    await admin.query("begin");
    await admin.query("set local role app_tenant");
    await admin.query("truncate audit_events");
    await admin.query("rollback");
    truncated = true;
  } catch {
    await admin.query("rollback").catch(() => {});
  }
  check(!truncated, "TRUNCATE on audit_events is rejected");

  // R2 · the object table must carry the same tenant guarantees as R1
  // The class, not just the instance: guardrail F-1 was a blanket grant, so assert
  // that NO relation in the schema is deletable by the application principal.
  const deletable = (
    await admin.query(`
      select count(*)::int as n
      from information_schema.tables t
      where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
        and has_table_privilege('app_runtime', format('%I.%I', t.table_schema, t.table_name), 'DELETE')
    `)
  ).rows[0].n;
  check(deletable === 0, "app_runtime holds DELETE on no table in schema public", `deletable: ${deletable}`);

  for (const r of await checkObjectsTable(admin, "objects")) {
    check(r.pass, r.name, r.detail);
  }

  // 9 · historical FK violations are reported, not fatal (the FKs are NOT VALID)
  const orphans = (
    await admin.query(
      `select count(*)::int as n from audit_events a
         left join workspaces w on w.id = a.workspace_id where w.id is null`,
    )
  ).rows[0].n;
  if (orphans > 0) {
    console.warn(
      `  ! ${orphans} historical audit row(s) reference a workspace that no longer exists (FK added NOT VALID)`,
    );
  }

  // ─── 10 · the APPLICATION's own connection must be least-privilege ─────────
  // Catalog checks cannot catch a superuser login with a reversible SET ROLE on
  // top: the pool looked scoped while `RESET ROLE` restored BYPASSRLS.
  if (!appDsn) {
    check(
      false,
      "APP_DATABASE_URL is configured (the app must not log in as the admin/owner)",
      "not set — the application would connect as the privileged principal",
    );
  } else {
    const app = new pg.Client({ connectionString: appDsn });
    await app.connect();
    try {
      const who = (
        await app.query(
          `select session_user, current_user,
                  (select rolsuper      from pg_roles where rolname = session_user) as su,
                  (select rolbypassrls  from pg_roles where rolname = session_user) as br,
                  (select count(*)::int from pg_class c
                     where c.relowner = (select oid from pg_roles where rolname = session_user)) as owned`,
        )
      ).rows[0];

      check(who.su === false, "APP session_user is not a superuser", `session_user=${who.session_user}`);
      check(who.br === false, "APP session_user has NOBYPASSRLS");
      check(who.owned === 0, "APP session_user owns no tables", `owns ${who.owned}`);
      check(
        who.session_user !== adminUser,
        "APP logs in as a separate principal from the admin/owner",
        `session_user=${who.session_user}`,
      );

      // RESET ROLE must gain nothing: the login principal is already bound.
      await app.query("reset role").catch(() => {});
      const after = (await app.query("select session_user, current_user")).rows[0];
      check(
        after.current_user === after.session_user,
        "after RESET ROLE the session is still the least-privilege principal",
        `current_user=${after.current_user}`,
      );

      // The definitive escalation test: can the APP suppress triggers or wipe history?
      let replica = false;
      try {
        await app.query("set session_replication_role = replica");
        replica = true;
        await app.query("reset session_replication_role");
      } catch {
        /* expected */
      }
      check(!replica, "APP cannot suppress triggers via session_replication_role (B3)");

      let wiped = false;
      try {
        await app.query("truncate audit_events");
        wiped = true;
      } catch {
        /* expected */
      }
      check(!wiped, "APP cannot TRUNCATE audit_events from its own connection");
    } finally {
      await app.end().catch(() => {});
    }
  }
} finally {
  await admin.end().catch(() => {});
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
