import { pingDatabase } from "@/db/client";

export interface Liveness { status: "ok"; }
export interface Readiness { status: "ready" | "degraded"; db: "up" | "down"; }

/** Liveness: the process is answering. No dependencies checked. */
export function liveness(): Liveness { return { status: "ok" }; }

/** Readiness: can we serve traffic? Verifies the database is reachable. */
export async function readiness(): Promise<{ status: number; body: Readiness }> {
  try {
    await pingDatabase();
    return { status: 200, body: { status: "ready", db: "up" } };
  } catch {
    return { status: 503, body: { status: "degraded", db: "down" } };
  }
}
