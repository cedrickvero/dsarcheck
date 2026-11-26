import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env";
import * as schema from "./schema";

/**
 * Database access.
 *
 * TWO PRINCIPALS, deliberately:
 *
 *  - The application pool logs in as APP_DATABASE_URL — a real, login-capable,
 *    least-privilege role (`app_runtime`: NOBYPASSRLS, non-owner, no TRUNCATE,
 *    no DDL).
 *  - The system pool uses DATABASE_URL — the admin/owner DSN. Migrations, test
 *    setup and the invariant verifier only. Never in request handling.
 *
 * Why the application must LOG IN as the restricted role rather than `SET ROLE`
 * to it: `SET ROLE` changes only `current_user`, leaving `session_user` as the
 * superuser that authenticated. One `RESET ROLE` — or any pooler that discards
 * session state — then restores BYPASSRLS and row-level security fails *open*.
 * A reversible privilege drop is not a control.
 */
export const pool = new Pool({
  connectionString: env.APP_DATABASE_URL,
  max: env.DB_POOL_MAX,
});

/** Privileged pool. Migrations, test setup and verification ONLY. */
export const systemPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 1,
});

export const db = drizzle(pool, { schema });
export const systemDb = drizzle(systemPool, { schema });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface TenantContext {
  orgId: string;
  workspaceId: string;
  actorId: string;
}

/**
 * Run `fn` inside a transaction that is tenant-scoped *at the database level*.
 *
 * `app.workspace_id` is the GUC every RLS policy reads: unset means the policy
 * evaluates NULL and the table looks empty — it fails closed, never open.
 * `app.actor_id` carries attribution. `SET LOCAL ROLE app_tenant` is
 * defence-in-depth on top of the already-restricted login principal.
 */
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${ctx.orgId}, true)`);
    await tx.execute(sql`select set_config('app.workspace_id', ${ctx.workspaceId}, true)`);
    await tx.execute(sql`select set_config('app.actor_id', ${ctx.actorId}, true)`);
    await tx.execute(sql`set local role app_tenant`);
    return fn(tx);
  });
}

/**
 * Run `fn` with NO tenant, but with the hash of one presented credential exposed to
 * the pre-auth lookup policies.
 *
 * This is what makes sign-in possible under FORCED row-level security. app.workspace_id
 * is deliberately NOT set, so every tenant policy evaluates NULL and denies: the only
 * rows visible are those whose hash equals the credential the caller already holds.
 * A lookup therefore cannot enumerate users, cannot read another workspace's rows, and
 * cannot see any table that has only a tenant policy. tests/auth-tenant.test.ts proves
 * each of those three.
 */
export interface LookupContext {
  /** sha256 of a presented magic-link token. */
  magicTokenHash?: string;
  /** sha256 of a presented session token. */
  sessionTokenHash?: string;
  /** sha256 of a normalised email address, for the "whose address is this?" lookup. */
  emailHash?: string;
  /** sha256 of a presented signed-link token (evidence-pack download). */
  signedLinkTokenHash?: string;
  /** A portal subdomain (slug) to resolve the owning workspace pre-tenant (public intake). */
  portalSubdomain?: string;
}

export async function withLookup<T>(
  ctx: LookupContext,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    if (ctx.magicTokenHash) {
      await tx.execute(sql`select set_config('app.magic_token_hash', ${ctx.magicTokenHash}, true)`);
    }
    if (ctx.sessionTokenHash) {
      await tx.execute(sql`select set_config('app.session_token_hash', ${ctx.sessionTokenHash}, true)`);
    }
    if (ctx.emailHash) {
      await tx.execute(sql`select set_config('app.lookup_email_hash', ${ctx.emailHash}, true)`);
    }
    if (ctx.signedLinkTokenHash) {
      await tx.execute(sql`select set_config('app.signed_link_token_hash', ${ctx.signedLinkTokenHash}, true)`);
    }
    if (ctx.portalSubdomain) {
      await tx.execute(sql`select set_config('app.lookup_subdomain', ${ctx.portalSubdomain}, true)`);
    }
    await tx.execute(sql`set local role app_tenant`);
    return fn(tx);
  });
}

/** Liveness/readiness probe that needs no tenant context. */
export async function pingDatabase(): Promise<void> {
  await pool.query("select 1");
}

export interface PrivilegeReport {
  sessionUser: string;
  currentUser: string;
  superuser: boolean;
  bypassRls: boolean;
  ownsTables: number;
}

/**
 * Assert the application's connection is least-privilege.
 *
 * Checks `session_user` — not just `current_user` — because that is the identity
 * an attacker regains with `RESET ROLE`. Wired into boot (src/instrumentation.ts)
 * and readiness, so a misconfigured deployment reports unhealthy instead of
 * silently serving every tenant's rows.
 */
export async function assertLeastPrivilege(): Promise<PrivilegeReport> {
  const { rows } = await pool.query<PrivilegeReport>(
    `select session_user as "sessionUser",
            current_user  as "currentUser",
            (select rolsuper     from pg_roles where rolname = session_user) as "superuser",
            (select rolbypassrls from pg_roles where rolname = session_user) as "bypassRls",
            (select count(*)::int from pg_class c
               where c.relowner = (select oid from pg_roles where rolname = session_user)) as "ownsTables"`,
  );
  const row = rows[0];
  if (!row) throw new Error("db: could not determine the connection identity");

  const problems: string[] = [];
  if (row.superuser) problems.push("session_user is a superuser");
  if (row.bypassRls) problems.push("session_user has BYPASSRLS");
  if (row.ownsTables > 0) problems.push(`session_user owns ${row.ownsTables} table(s)`);
  if (row.sessionUser === env.DB_OWNER_USER) {
    problems.push(`session_user is the configured owner role (${env.DB_OWNER_USER})`);
  }

  if (problems.length > 0) {
    throw new Error(
      `db: refusing to run with a privileged connection — ${problems.join("; ")}. ` +
        "Point APP_DATABASE_URL at the least-privilege login role (npm run db:migrate does this).",
    );
  }
  return row;
}
