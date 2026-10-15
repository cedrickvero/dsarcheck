import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

/** Process-wide Postgres pool. */
export const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, { schema });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Run `fn` inside a transaction with the row-level-security tenant GUC set.
 *
 * All reads and writes of customer data must go through here (or an equivalent
 * that sets app.workspace_id). RLS policies in the database then guarantee that
 * a query can only ever see the active workspace's rows.
 */
export async function withTenant<T>(
  workspaceId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);
    return fn(tx);
  });
}
