"use client";

/**
 * Per-system status form. The status change is a server action passed in from the server
 * component (so this file imports nothing server-only and the boundary holds). The failure
 * message from the action is surfaced verbatim - e.g. the evidence guard on "Completed".
 */
import { useState } from "react";

const SETTABLE_STATUSES = [
  "In progress",
  "Completed",
  "Not found",
  "Action required",
  "Retained under exception",
] as const;

export interface SystemStatusActionResult {
  ok: boolean;
  message?: string;
}

export function SystemStatusForm(props: {
  caseId: string;
  caseNumber: string;
  sourceKey: string;
  currentStatus: string;
  exceptionCategories: string[];
  action: (input: {
    caseId: string;
    caseNumber: string;
    sourceKey: string;
    status: string;
    reason: string;
    exceptionCategory?: string;
  }) => Promise<SystemStatusActionResult>;
}) {
  const [status, setStatus] = useState(props.currentStatus);
  const [reason, setReason] = useState("");
  const [exCat, setExCat] = useState(props.exceptionCategories[0] ?? "");
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
      status,
      reason,
      exceptionCategory: status === "Retained under exception" ? exCat : undefined,
    });
    setBusy(false);
    if (result.ok) {
      setReason("");
      setExCat(props.exceptionCategories[0] ?? "");
    } else {
      setError(result.message ?? "Could not update the status.");
    }
  };

  return (
    <form className="system-status-form" onSubmit={submit}>
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        aria-label={`Status for ${props.sourceKey}`}
      >
        {status === "Not started" ? (
          <option value="Not started" disabled>
            Not started
          </option>
        ) : null}
        {SETTABLE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (required)"
        required
      />
      {status === "Retained under exception" ? (
        <select
          value={exCat}
          onChange={(event) => setExCat(event.target.value)}
          aria-label="Exception category"
        >
          {props.exceptionCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : null}
      <button type="submit" className="button button--primary">
        {busy ? "Saving…" : "Update"}
      </button>
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
