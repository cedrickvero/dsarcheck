import { pool } from "@/db/client";

/**
 * Shared health logic for both the root-level (/health) and API-namespaced
 * (/api/health) routes, so the two surfaces cannot drift apart.
 *
 * Server-only: never import this into a client component.
 */
export interface Liveness {
  status: "ok";
}

export interface Readiness {
  status: "ready" | "degraded";
  db: "up" | "down";
}

/** Liveness: the process is answering. Checks no dependencies. */
export function liveness(): Liveness {
  return { status: "ok" };
}

/** Readiness: can we serve traffic? Verifies the database connection. */
export async function readiness(): Promise<{ status: number; body: Readiness }> {
  try {
    await pool.query("select 1");
    return { status: 200, body: { status: "ready", db: "up" } };
  } catch {
    // Never leak the connection error; readiness is a boolean to the caller.
    return { status: 503, body: { status: "degraded", db: "down" } };
  }
}
