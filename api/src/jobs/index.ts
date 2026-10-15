import { QUEUE_NAMES } from "./queues";

/**
 * Worker bootstrap.
 *
 * TODO(jobs slice): attach one BullMQ Worker per queue in QUEUE_NAMES, sharing
 * the Redis connection from env.REDIS_URL, then start them here.
 *
 * Deliberately does NOT open a Redis connection yet, so `npm run dev:worker`
 * cannot hang or crash when Redis is not up during local scaffolding.
 */
export async function startWorkers(): Promise<void> {
  console.log(`Queues registered: ${QUEUE_NAMES.join(", ")}`);
}
