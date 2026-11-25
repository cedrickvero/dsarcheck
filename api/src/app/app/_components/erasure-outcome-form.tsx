"use client";

/**
 * Per-system erasure outcome form. "Retained under exception" reveals the exception
 * category; every outcome needs a reason (surfaced verbatim from the action on failure).
 */
import { useState } from "react";

const OUTCOMES = [
  "Deleted",
  "Suppressed / anonymized",
  "Retained under exception",
  "Not found",
  "Action required",
] as const;

export type ErasureOutcomeAction = (input: {
  caseId: string;
  caseNumber: string;
  sourceKey: string;
  outcome: string;
  reason: string;
  exceptionCategory?: string;
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
      exceptionCategory: outcome === "Retained under exception" ? exCat : undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Could not record the outcome.");
    } else {
      setReason("");
    }
  };

  return (
    <form className="system-status-form" onSubmit={submit}>
      <select value={outcome} onChange={(event) => setOutcome(event.target.value)} aria-label={`Outcome for ${props.sourceKey}`}>
        <option value="" disabled>
          Choose an outcome…
        </option>
        {OUTCOMES.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <input type="text" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (required)" required />
      {outcome === "Retained under exception" ? (
        <select value={exCat} onChange={(event) => setExCat(event.target.value)} aria-label="Exception category">
          {props.exceptionCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : null}
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
