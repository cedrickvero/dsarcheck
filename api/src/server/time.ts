/**
 * The clock. docs/04 requires a FIXED development clock at the prototype's "now"
 * (2026-10-13T10:42) so rendered screens match the handoff deterministically.
 *
 * It CANNOT reach production: the override is only consulted when NODE_ENV is not
 * "production", and an unparseable value is ignored rather than throwing. A development
 * convenience that could alter production behaviour would be a defect, not a feature.
 */
export function now(): Date {
  if (process.env.NODE_ENV !== "production") {
    const pinned = process.env.DEV_FIXED_NOW;
    if (pinned) {
      const parsed = new Date(pinned);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return new Date();
}
