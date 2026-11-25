"use client";

/**
 * The review/export flow: handler requests review, an approver completes it (reason),
 * then the final redacted export is generated. Export is not offered until review is done.
 */
import { useState } from "react";

export type NoInputAction = (input: { caseId: string; caseNumber: string }) => Promise<{ ok: boolean; message?: string }>;
export type ReasonAction = (input: { caseId: string; caseNumber: string; reason: string }) => Promise<{ ok: boolean; message?: string }>;

export function RedactionActions(props: {
  caseId: string;
  caseNumber: string;
  review: "none" | "requested" | "done";
  finalExportDone: boolean;
  canCompleteReview: boolean;
  requestReview: NoInputAction;
  completeReview: ReasonAction;
  markExport: NoInputAction;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) setError(result.message ?? "Could not complete the action.");
    else setReason("");
  };

  return (
    <div className="redaction-actions">
      {props.review === "none" ? (
        <button
          type="button"
          className="button"
          onClick={() => run(() => props.requestReview({ caseId: props.caseId, caseNumber: props.caseNumber }))}
        >
          Request review
        </button>
      ) : null}
      {props.review === "requested" && props.canCompleteReview ? (
        <form
          className="system-status-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => props.completeReview({ caseId: props.caseId, caseNumber: props.caseNumber, reason }));
          }}
        >
          <input type="text" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Review reason (required)" required />
          <button type="submit" className="button button--primary">
            {busy ? "Saving…" : "Complete review"}
          </button>
        </form>
      ) : null}
      {props.review === "done" && !props.finalExportDone ? (
        <button
          type="button"
          className="button button--primary"
          onClick={() => run(() => props.markExport({ caseId: props.caseId, caseNumber: props.caseNumber }))}
        >
          Generate final redacted export
        </button>
      ) : null}
      {props.finalExportDone ? (
        <span className="status" data-status="Completed">
          Final redacted export generated
        </span>
      ) : null}
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
