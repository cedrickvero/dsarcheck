import { randomUUID } from "node:crypto";

export const newId = (): string => randomUUID();

/**
 * Human-facing case reference, e.g. DSAR-2026-00418 (docs/04).
 *
 * NOTE: docs/08 §4 Q1 is still open — global vs per-workspace sequence. Until
 * that is decided the caller supplies the sequence, so no numbering policy is
 * baked in here.
 */
export function caseReference(year: number, sequence: number): string {
  return `DSAR-${year}-${String(sequence).padStart(5, "0")}`;
}
