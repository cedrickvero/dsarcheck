/**
 * Shared domain types (docs/04-data-model.md).
 *
 * Pure types only — no I/O, no framework imports, so both the API and the
 * client can depend on them.
 *
 * TODO(data slice): port the full entity set from docs/04.
 */

export type CaseStatus =
  | "new"
  | "identity_pending"
  | "in_progress"
  | "awaiting_approval"
  | "response_sent"
  | "closed"
  | "rejected";

export type RequestType =
  | "access"
  | "erasure"
  | "rectification"
  | "portability"
  | "objection";

/** The five outcomes the erasure board distinguishes (docs/03 § E4b). */
export type ErasureOutcome =
  | "deleted"
  | "suppressed_or_anonymized"
  | "retained_under_exception"
  | "not_found"
  | "action_required";

export type SlaRisk = "on_track" | "due_soon" | "overdue";
