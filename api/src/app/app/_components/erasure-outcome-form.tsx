"use client";

/**
 * Per-system erasure outcome form. "Retained under exception" reveals the exception
 * category; every outcome needs a reason (surfaced verbatim from the action on failure).
 * Submits the canonical snake_case key; the display label is shown to the user.
 */
import { useState } from "react";

const OUTCOMES = [
  { key: "deleted", label: "Deleted" },
  { key: "suppressed", label: "Suppressed / anonymized" },
  { key: "retained_under_exception", label: "Retained under exception" },
  { key: "not_found", label: "Not found" },
  { key: "action_required", label: "Action required" },
] as const;

export type ErasureOutcomeAction = (input: {
  caseId: string;
  caseNumber: string;
  sourceKey: string;
  outcome: string;
  reason: string;
  exceptionCategory?: string;
  hasOutcomeRecord?: boolean;
}) => Promise<{ ok: boolean; message?: string }>;

export function ErasureOutcomeForm(props: {
  caseId: string;
  caseNumber: string;
  sourceKey: string;
  currentOutcome: string | null;
  exceptionCategories: string[];
  action: ErasureOutcomeAction;
}) {
  const [outcome, setOutcome] = useState(props.currentOutcome ?? "");
  const [reason, setReason] = useState("");
  const [exCat, setExCat] = useState<string>(props.exceptionCategories[0] ?? "");
  const [hasOutcomeRecord, setHasOutcomeRecord] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await props.action({
      caseId: props.caseId,
      caseNumber: props.caseNumber,
      sourceKey: props.sourceKey,
      outcome,
      reason,
      exceptionCategory: outcome === "retained_under_exception" ? exCat : undefined,
      hasOutcomeRecord,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Could not record the outcome.");
    } else {
      setReason("");
      setHasOutcomeRecord(false);
    }
  };

  return (
    <form className="system-status-form" onSubmit={submit}>
      <select value={outcome} onChange={(event) => setOutcome(event.target.value)} aria-label={`Outcome for ${props.sourceKey}`}>
        <option value="" disabled>
          Choose an outcome…
        </option>
        {OUTCOMES.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <input type="text" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (required)" required />
      {outcome === "retained_under_exception" ? (
        <select value={exCat} onChange={(event) => setExCat(event.target.value)} aria-label="Exception category">
          {props.exceptionCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : null}
      <label className="check-field">
        <input type="checkbox" checked={hasOutcomeRecord} onChange={(event) => setHasOutcomeRecord(event.target.checked)} />
        <span>Outcome record attached</span>
      </label>
      <button type="submit" className="button button--primary">
        {busy ? "Saving…" : "Record"}
      </button>
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
