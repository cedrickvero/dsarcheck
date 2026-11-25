"use client";

/**
 * Redact (or un-redact) one flagged token. The category is on the token; the handler
 * supplies the reason (docs/05: apply redaction requires category + reason ≥3 chars).
 */
import { useState } from "react";

export type RedactionAction = (input: {
  caseId: string;
  caseNumber: string;
  tokenId: string;
  redacted: boolean;
  reason: string;
}) => Promise<{ ok: boolean; message?: string }>;

export function TokenRedactForm(props: {
  caseId: string;
  caseNumber: string;
  tokenId: string;
  redacted: boolean;
  action: RedactionAction;
}) {
  const [reason, setReason] = useState("");
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
      tokenId: props.tokenId,
      redacted: !props.redacted,
      reason,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Could not record the redaction.");
    } else {
      setReason("");
    }
  };

  return (
    <form className="system-status-form" onSubmit={submit}>
      <input type="text" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (required)" required />
      <button type="submit" className="button button--primary">
        {busy ? "Saving…" : props.redacted ? "Unredact" : "Redact"}
      </button>
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
