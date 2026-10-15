/**
 * Clock abstraction.
 *
 * Set DEV_FIXED_NOW (ISO 8601) to freeze time so seed data, screenshots and
 * tests stay reproducible. Production leaves it unset and uses the real clock.
 *
 * Nothing in src/domain may call `new Date()` directly — always go through here,
 * otherwise the pure functions stop being deterministically testable.
 */
const FIXED_NOW = process.env.DEV_FIXED_NOW;

export function now(): Date {
  return FIXED_NOW ? new Date(FIXED_NOW) : new Date();
}

export const isFrozen = (): boolean => Boolean(FIXED_NOW);
