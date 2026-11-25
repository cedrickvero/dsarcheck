"use client";

/**
 * Generate / regenerate the evidence pack. A no-input action (docs/05 does not require a
 * reason for generation); the audit event records the actor and version.
 */
import { useState } from "react";

export type GeneratePackAction = (input: { caseId: string; caseNumber: string }) => Promise<{ ok: boolean; message?: string }>;

export function GeneratePackButton(props: {
  caseId: string;
  caseNumber: string;
  hasVersions: boolean;
  action: GeneratePackAction;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await props.action({ caseId: props.caseId, caseNumber: props.caseNumber });
    setBusy(false);
    if (!result.ok) setError(result.message ?? "Could not generate the pack.");
  };

  return (
    <div>
      <button type="button" className="button button--primary" onClick={run} disabled={busy}>
        {busy ? "Generating…" : props.hasVersions ? "Regenerate pack" : "Generate evidence pack"}
      </button>
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
