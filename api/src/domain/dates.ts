/**
 * Date arithmetic and formatting for the domain layer.
 *
 * The prototype ran on local dates; production stores UTC and displays in the
 * workspace timezone (docs/04). Everything here works in UTC so the seeded
 * dates, the screenshots and the tests agree regardless of `TZ`.
 *
 * Formats come from the instance rules: `13 Oct 2026` / `13 Oct` /
 * `13 Oct 2026, 10:42` (24h).
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MS_PER_DAY = 86_400_000;

/** Parse `YYYY-MM-DD` as UTC midnight. Rejects anything else. */
export function parseIsoDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`parseIsoDate: expected YYYY-MM-DD, got "${iso}"`);
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

/** UTC midnight of the given instant. */
export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Add whole months, UTC. Month-end overflow matches the prototype (`setMonth`). */
export function addMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export function addDaysUtc(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Whole days between two instants, rounded — the prototype's
 * `Math.round((b - a) / 86400000)`.
 */
export function diffInDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** `13 Oct 2026` */
export function formatDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** `13 Oct` */
export function formatDateShort(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** `13 Oct 2026, 10:42` — 24-hour clock, per the instance rules. */
export function formatDateTime(date: Date): string {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(date)}, ${hh}:${mm}`;
}

/** Pluralise a day count: `1 day` / `N days`. */
export function dayWord(n: number): string {
  return n === 1 ? "day" : "days";
}
