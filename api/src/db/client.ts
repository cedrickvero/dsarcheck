import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env";
import * as schema from "./schema";

/**
 * Database access.
 *
 * IMPORTANT — why there is a `SET ROLE` on every connection:
 * the configured connection user is a superuser *and* the table owner, and
 * PostgreSQL exempts both from row-level security unconditionally. Running the
 * application as that principal makes every RLS policy inert: isolation tests
 * pass, and so does every cross-tenant query. `app_runtime` (NOBYPASSRLS,
 * owns nothing) is what makes the policies in migration 0003 real, so every
 * pooled connection assumes it before application code can use it.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
});

pool.on("connect", (client) => {
  // pg serialises queries per client, so this SET ROLE is guaranteed to run
  // before anything the application queues on the same connection.
  client.query("set role app_runtime").catch((error: unknown) => {
    // Never hand out a connection that failed to drop privileges.
    console.error("db: SET ROLE app_runtime failed — destroying connection", error);
    client.release(error instanceof Error ? error : new Error("role assumption failed"));
  });
});

/** A pool that has NOT dropped privileges. Migrations, test setup and the
 *  invariant verifier only. Never use this in request handling. */
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
 * - `app.workspace_id` — the GUC every RLS policy reads. Unset => the policy
 *   evaluates NULL => zero rows (fail closed, never fail open).
 * - `app.actor_id` — attribution available to the same transaction.
 * - `SET LOCAL ROLE app_tenant` — belt and braces on top of the connection-level
 *   `app_runtime`; both are NOBYPASSRLS.
 *
 * Anything touching customer data MUST go through here. Scoping is enforced by
 * PostgreSQL, not by remembering to add a WHERE clause.
 */
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.workspace_id', ${ctx.workspaceId}, true)`);
    await tx.execute(sql`select set_config('app.actor_id', ${ctx.actorId}, true)`);
    await tx.execute(sql`set local role app_tenant`);
    return fn(tx);
  });
}

/** Liveness/readiness probe that needs no tenant context. */
export async function pingDatabase(): Promise<void> {
  await pool.query("select 1");
}

/**
 * Startup assertion: refuse to serve traffic from a connection that can bypass
 * the tenant policies. Called from the health route and available to scripts.
 */
export async function assertLeastPrivilege(): Promise<{ user: string; superuser: boolean }> {
  const { rows } = await pool.query<{ user: string; superuser: boolean }>(
    "select current_user as user, (select rolsuper from pg_roles where rolname = current_user) as superuser",
  );
  const row = rows[0];
  if (!row) throw new Error("db: could not determine the connection identity");
  if (row.superuser || row.user === env.DB_OWNER_USER) {
    throw new Error(
      `db: refusing to run as a privileged role (current_user=${row.user}); ` +
        "row-level security would be bypassed",
    );
  }
  return row;
}
