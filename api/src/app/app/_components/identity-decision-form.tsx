"use client";

/**
 * The identity decision form. Approve / request more information / reject, each with the
 * required reason; requesting information also names what is needed. The high-risk
 * approver-only rule is enforced server-side and surfaced here as the action's message.
 */
import { useState } from "react";

export type IdentityDecisionAction = (input: {
  caseId: string;
  caseNumber: string;
  decision: "approve" | "reject" | "request_info";
  reason: string;
  infoOption?: string;
}) => Promise<{ ok: boolean; message?: string }>;

const DECISIONS = [
  { value: "approve", label: "Approve identity" },
  { value: "request_info", label: "Request more information" },
  { value: "reject", label: "Reject" },
] as const;

export function IdentityDecisionForm(props: {
  caseId: string;
  caseNumber: string;
  action: IdentityDecisionAction;
}) {
  const [decision, setDecision] = useState<"approve" | "reject" | "request_info">("approve");
  const [reason, setReason] = useState("");
  const [infoOption, setInfoOption] = useState("");
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
      decision,
      reason,
      infoOption: decision === "request_info" ? infoOption : undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Could not record the decision.");
    }
  };

  return (
    <form className="identity-decision-form" onSubmit={submit}>
      <label className="field">
        <span>Decision</span>
        <select
          value={decision}
          onChange={(event) => setDecision(event.target.value as "approve" | "reject" | "request_info")}
        >
          {DECISIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Reason (required)</span>
        <input type="text" value={reason} onChange={(event) => setReason(event.target.value)} required />
      </label>
      {decision === "request_info" ? (
        <label className="field">
          <span>What is needed</span>
          <input
            type="text"
            value={infoOption}
            onChange={(event) => setInfoOption(event.target.value)}
            placeholder="Additional account identifier"
          />
        </label>
      ) : null}
      <button type="submit" className="button button--primary">
        {busy ? "Recording…" : "Record decision"}
      </button>
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
