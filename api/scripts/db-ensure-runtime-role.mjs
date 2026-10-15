#!/usr/bin/env node
/**
 * db-ensure-runtime-role — turns `app_runtime` into a real, login-capable,
 * least-privilege principal and prints the DSN the application must use.
 *
 * Why this is a post-migrate step rather than a migration:
 * `SET ROLE app_runtime` only changes `current_user`; `session_user` remains the
 * superuser that authenticated. A single `RESET ROLE` — or any connection pooler
 * that discards session state — therefore restores BYPASSRLS and row-level
 * security fails OPEN. The application must LOG IN as the least-privilege role,
 * not assume it. Passwords cannot be parameterised inside a migration, so they
 * are set here from the environment.
 *
 * Idempotent. Run automatically by `npm run db:migrate`.
 */

import pg from "pg";

const adminDsn = process.env.DATABASE_URL;
if (!adminDsn) {
  console.error("db-ensure-runtime-role: DATABASE_URL (admin DSN) is not set");
  process.exit(2);
}

const APP_ROLE = process.env.APP_DB_ROLE || "app_runtime";
const TENANT_ROLE = process.env.APP_TENANT_ROLE || "app_tenant";
const password = process.env.APP_DB_PASSWORD || "app_runtime_dev_password";

/** Single-quote a value for a SQL literal. */
const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;

/** app_runtime is not a valid identifier candidate for injection — but never trust env. */
const ident = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    console.error(`db-ensure-runtime-role: invalid role name ${JSON.stringify(name)}`);
    process.exit(2);
  }
  return `"${name}"`;
};

const role = ident(APP_ROLE);
const tenant = ident(TENANT_ROLE);

const client = new pg.Client({ connectionString: adminDsn });
await client.connect();

try {
  const { rows } = await client.query("select 1 from pg_roles where rolname = $1", [APP_ROLE]);
  if (rows.length === 0) {
    console.error(
      `db-ensure-runtime-role: role ${APP_ROLE} does not exist. Apply migrations first ` +
        "(migration 0003 creates it).",
    );
    process.exit(2);
  }

  // A LOGIN principal that cannot escalate: no superuser, no BYPASSRLS, no DDL.
  await client.query(
    `alter role ${role} login nosuperuser nobypassrls nocreatedb nocreaterole password ${lit(password)}`,
  );
  await client.query(`grant ${tenant} to ${role}`);
  await client.query(`grant usage on schema public to ${role}`);
  await client.query(`grant select, insert, update, delete on all tables in schema public to ${role}`);
  await client.query(`revoke truncate, references, trigger on all tables in schema public from ${role}`);
  await client.query(`revoke create on schema public from ${role}`);
  await client.query(`revoke truncate, references, trigger on all tables in schema public from ${tenant}`);
  await client.query(
    `alter default privileges in schema public grant select, insert, update, delete on tables to ${role}`,
  );

  // Prove it before declaring success: the password must actually authenticate
  // and the resulting session must be least-privilege.
  const appDsn = new URL(adminDsn);
  appDsn.username = APP_ROLE;
  appDsn.password = password;
  const probe = new pg.Client({ connectionString: appDsn.toString() });
  await probe.connect();
  const who = (
    await probe.query(
      "select session_user, current_user, (select rolsuper from pg_roles where rolname = session_user) as su, " +
        "(select rolbypassrls from pg_roles where rolname = session_user) as br",
    )
  ).rows[0];
  await probe.end();

  if (who.su || who.br) {
    console.error(
      `db-ensure-runtime-role: FAILED — session_user=${who.session_user} still has ` +
        `superuser=${who.su} bypassrls=${who.br}`,
    );
    process.exit(1);
  }

  console.log(
    `db-ensure-runtime-role: ${APP_ROLE} is LOGIN, least-privilege ` +
      `(session_user=${who.session_user}, superuser=false, bypassrls=false)`,
  );
  console.log(`db-ensure-runtime-role: application DSN is`);
  console.log(appDsn.toString());
  if (!process.env.APP_DB_PASSWORD) {
    console.log(
      "db-ensure-runtime-role: password was generated for this run — persist it as " +
        "APP_DB_PASSWORD and set APP_DATABASE_URL to the DSN above.",
    );
  }
} finally {
  await client.end().catch(() => {});
}
