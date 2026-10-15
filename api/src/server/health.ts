import { assertLeastPrivilege, pingDatabase } from "@/db/client";

export interface Liveness {
  status: "ok";
}
export interface Readiness {
  status: "ready" | "degraded";
  db: "up" | "down";
}

/** Liveness: the process is answering. No dependencies checked. */
export function liveness(): Liveness {
  return { status: "ok" };
}

/**
 * Readiness: can we serve traffic safely?
 *
 * Two independent failure modes, both 503 but distinguished in the body:
 *   - the database is unreachable   -> db: "down"
 *   - the connection is privileged  -> db: "up"   (reachable but unsafe to serve)
 *
 * The second matters because a superuser or table-owner connection bypasses
 * every RLS policy: the app would answer every request while silently ignoring
 * tenant isolation. The boot-time assertion in src/instrumentation.ts is the
 * primary control; this keeps a long-running process from reporting healthy
 * after its environment drifted.
 */
export async function readiness(): Promise<{ status: number; body: Readiness }> {
  try {
    await pingDatabase();
  } catch {
    return { status: 503, body: { status: "degraded", db: "down" } };
  }
  try {
    await assertLeastPrivilege();
  } catch {
    return { status: 503, body: { status: "degraded", db: "up" } };
  }
  return { status: 200, body: { status: "ready", db: "up" } };
}
