import { env } from "./env";
import { startWorkers } from "./jobs";

/**
 * Worker entry point. Runs the background jobs described in docs/06:
 * SLA reminders + escalation, DNS verification, support-grant expiry,
 * retention purge, and evidence-pack generation.
 */
async function main(): Promise<void> {
  console.log(`DSAR worker starting (${env.NODE_ENV})`);
  await startWorkers();
  console.log("DSAR worker ready");
}

main().catch((error: unknown) => {
  console.error("Worker failed to start", error);
  process.exit(1);
});
