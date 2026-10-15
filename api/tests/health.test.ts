import { describe, expect, it, vi } from "vitest";

/**
 * Readiness has two independent failure modes and they mean different things:
 * the database being unreachable (`db: "down"`) versus the connection being
 * privileged (`db: "up"` but not safe to serve). Both must report 503 — a
 * deployment whose DSN is a superuser bypasses every tenant policy.
 */
const { ping, assertPriv } = vi.hoisted(() => ({
  ping: vi.fn(),
  assertPriv: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  pingDatabase: ping,
  assertLeastPrivilege: assertPriv,
}));

const { liveness, readiness } = await import("@/server/health");

const LEAST = {
  sessionUser: "app_runtime",
  currentUser: "app_runtime",
  superuser: false,
  bypassRls: false,
  ownsTables: 0,
};

describe("health", () => {
  it("liveness is always ok and checks no dependencies", () => {
    expect(liveness()).toEqual({ status: "ok" });
  });

  it("is ready when the database answers and the connection is least-privilege", async () => {
    ping.mockResolvedValueOnce(undefined);
    assertPriv.mockResolvedValueOnce(LEAST);
    await expect(readiness()).resolves.toEqual({
      status: 200,
      body: { status: "ready", db: "up" },
    });
  });

  it("is degraded when the database is unreachable", async () => {
    ping.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(readiness()).resolves.toEqual({
      status: 503,
      body: { status: "degraded", db: "down" },
    });
  });

  it("is degraded when the connection is privileged", async () => {
    ping.mockResolvedValueOnce(undefined);
    assertPriv.mockRejectedValueOnce(new Error("refusing to run with a privileged connection"));
    await expect(readiness()).resolves.toEqual({
      status: 503,
      body: { status: "degraded", db: "up" },
    });
  });
});
