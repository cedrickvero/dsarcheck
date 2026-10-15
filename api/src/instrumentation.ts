/**
 * Next.js instrumentation - runs once per server process at boot.
 *
 * The application's database connection must not be privileged: a superuser or
 * table-owner connection bypasses every row-level security policy, so the app
 * would silently read and write across tenants. In production that must stop the
 * server from booting; in development it is logged loudly so the app still runs
 * without a database.
 *
 * IMPORTANT - keep the import INSIDE the positive NEXT_RUNTIME check.
 * `next dev` compiles this file for the edge runtime as well as nodejs. A
 * negative guard (`if (NEXT_RUNTIME !== "nodejs") return;` followed by a
 * top-level dynamic import) is NOT dead-code-eliminated for the edge build, so
 * the whole node-only chain (@/db/client -> @/env -> dotenv/config, which
 * requires `path`) is pulled into the edge bundle and fails to resolve:
 *
 *   Module not found: Can't resolve 'path'
 *   Import trace: dotenv/config -> src/env.ts -> src/db/client.ts -> src/instrumentation.ts
 *
 * That made EVERY dev-mode route return HTTP 500 - and docker-compose.yaml and
 * the Dockerfile both run the API as `npm run dev`. The positive form below is
 * eliminated from the edge build, which is why it is written this way.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionConfig } = await import("@/env");
    const { assertLeastPrivilege } = await import("@/db/client");
    // Runtime config re-assertion, without the build-phase exemption: the import-time
    // guard can be skipped by mutating NEXT_PHASE, this one cannot.
    assertProductionConfig();
    try {
      const who = await assertLeastPrivilege();
      console.log(
        `db: application principal "${who.sessionUser}" is least-privilege ` +
          `(superuser=${who.superuser}, bypassrls=${who.bypassRls}, owns=${who.ownsTables})`,
      );
    } catch (error) {
      // Dynamic import, like the others above: keeps this file safe for the edge build.
      const { logError } = await import("@/server/log");
      logError("instrumentation", error, { phase: "boot", assertion: "least-privilege" });
      if (process.env.NODE_ENV === "production") throw error;
    }
  }
}
