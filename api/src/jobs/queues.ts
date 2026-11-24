/**
 * BullMQ queue names (docs/06-backend-security.md § Jobs).
 *
 * One queue per job family so a slow or failing job cannot starve the others.
 */
export const QUEUE_NAMES = [
  "sla-reminders", // SLA countdown reminders + escalation
  "dns-checks", // custom domain + sending domain verification
  "grant-expiry", // time-limited support grants
  "purge", // raw-export purge + retention deletion after case closure
  "evidence-pack", // evidence pack generation (PDF + ZIP)
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];
