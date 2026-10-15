/**
 * Next.js instrumentation — runs once per server process at boot.
 *
 * The application's database connection must not be privileged: a superuser or
 * table-owner connection bypasses every row-level security policy, so the app
 * would silently read and write across tenants. In production that must stop
 * the server from booting. In development it is logged loudly instead, so the
 * app can still start on a machine without a database.
 *
 * This exists because the previous "startup assertion" was defined and never
 * called — a guard nobody invokes is not a guard.
 */
export async function register(): Promise<void> {
  // Only the Node.js runtime has a database connection to assert about.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { assertLeastPrivilege } = await import("@/db/client");
    const who = await assertLeastPrivilege();
    console.log(
      `db: application principal "${who.sessionUser}" is least-privilege ` +
        `(superuser=false, bypassrls=false, owns=0)`,
    );
  } catch (error) {
    console.error("db: least-privilege assertion FAILED:", error);
    if (process.env.NODE_ENV === "production") throw error;
    console.error(
      "db: continuing because NODE_ENV is not production — FIX BEFORE DEPLOYING. " +
        "Run `npm run db:migrate` to provision the least-privilege role.",
    );
  }
}
