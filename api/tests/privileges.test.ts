import { afterAll, describe, expect, it } from "vitest";
import { assertLeastPrivilege, pool, pingDatabase } from "@/db/client";

/**
 * Regression cover for the B1 finding.
 *
 * Round 2 of the guardrail review proved that `SET ROLE app_runtime` was not a
 * control: `session_user` stayed the superuser, so a single `RESET ROLE`
 * restored BYPASSRLS. The application therefore has to *log in* as the
 * least-privilege role. These tests fail if anything reintroduces a privileged
 * login or makes the assertion vacuous again.
 *
 * Requires APP_DATABASE_URL to point at the least-privilege role.
 */
const hasDb = Boolean(process.env.APP_DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

if (!hasDb) {
  console.warn("privileges: APP_DATABASE_URL not set - regression suite skipped");
}

suite("application connection privileges (B1 regression)", () => {
  afterAll(async () => {
    await pool.end().catch(() => {});
  });

  it("the pooled session_user is not a superuser and has no BYPASSRLS", async () => {
    const who = await assertLeastPrivilege();
    expect(who.superuser).toBe(false);
    expect(who.bypassRls).toBe(false);
    expect(who.sessionUser).not.toBe(process.env.DB_OWNER_USER ?? "hermes");
  });

  it("the application principal owns no tables", async () => {
    const who = await assertLeastPrivilege();
    expect(who.ownsTables).toBe(0);
  });

  it("RESET ROLE does not escalate the pooled connection", async () => {
    const client = await pool.connect();
    try {
      const before = (
        await client.query<{ session_user: string; current_user: string }>(
          "select session_user, current_user",
        )
      ).rows[0]!;
      await client.query("reset role");
      const after = (
        await client.query<{ session_user: string; current_user: string; su: boolean }>(
          `select session_user, current_user,
                  (select rolsuper from pg_roles where rolname = session_user) as su`,
        )
      ).rows[0]!;

      // The whole point: resetting to the session identity must not grant more.
      expect(after.su).toBe(false);
      expect(after.current_user).toBe(after.session_user);
      expect(after.session_user).toBe(before.session_user);
    } finally {
      client.release();
    }
  });

  it("the connection cannot suppress triggers or wipe audit history", async () => {
    const client = await pool.connect();
    try {
      await expect(
        client.query("set session_replication_role = replica"),
      ).rejects.toThrow(/permission denied/i);
      await expect(client.query("truncate audit_events")).rejects.toThrow(/permission denied/i);
    } finally {
      client.release();
    }
  });

  it("liveness still works through the restricted connection", async () => {
    await expect(pingDatabase()).resolves.toBeUndefined();
  });
});
