import { describe, expect, it, vi } from "vitest";

/**
 * Readiness has two branches and only one of them is observable without a live
 * Postgres, so cover both here with a stubbed pool.
 */
const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/db/client", () => ({ pool: { query } }));

const { liveness, readiness } = await import("@/server/health");

describe("health", () => {
  it("liveness is always ok", () => {
    expect(liveness()).toEqual({ status: "ok" });
  });

  it("readiness returns 200/ready when the database answers", async () => {
    query.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    await expect(readiness()).resolves.toEqual({
      status: 200,
      body: { status: "ready", db: "up" },
    });
  });

  it("readiness returns 503/degraded when the database is unreachable", async () => {
    query.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(readiness()).resolves.toEqual({
      status: 503,
      body: { status: "degraded", db: "down" },
    });
  });
});
