"use client";

/**
 * Template select and the approval transitions. The actions are server actions passed in
 * from the server component (so this file imports nothing server-only). A single reason
 * field feeds whichever transition applies to the current status.
 */
import { useState } from "react";

export interface ApprovalActions {
  selectTemplate: (input: { caseId: string; caseNumber: string; template: string }) => Promise<{ ok: boolean; message?: string }>;
  sendForApproval: (input: { caseId: string; caseNumber: string; reason: string }) => Promise<{ ok: boolean; message?: string }>;
  approveAndClose: (input: { caseId: string; caseNumber: string; reason: string }) => Promise<{ ok: boolean; message?: string }>;
  requestChanges: (input: { caseId: string; caseNumber: string; reason: string }) => Promise<{ ok: boolean; message?: string }>;
  rejectCase: (input: { caseId: string; caseNumber: string; reason: string }) => Promise<{ ok: boolean; message?: string }>;
}

export function ApprovalForm(props: {
  caseId: string;
  caseNumber: string;
  status: string;
  template: string;
  templates: string[];
  canSend: boolean;
  canDecide: boolean;
  actions: ApprovalActions;
}) {
  const [template, setTemplate] = useState(props.template);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) setError(result.message ?? "That action could not be completed.");
  };

  const awaiting = props.status === "Awaiting approval";
  const canSendNow = props.canSend && (props.status === "In progress" || props.status === "Extended");
  const showTransitions = canSendNow || awaiting;

  return (
    <div className="approval-form">
      <div className="template-form">
        <label className="field">
          <span>Response template</span>
          <select value={template} onChange={(event) => setTemplate(event.target.value)}>
            <option value="">Select a template…</option>
            {props.templates.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button"
          onClick={() =>
            run(() => props.actions.selectTemplate({ caseId: props.caseId, caseNumber: props.caseNumber, template }))
          }
        >
          Save template
        </button>
      </div>

      {showTransitions ? (
        <>
          <label className="field">
            <span>Reason (required)</span>
            <input type="text" value={reason} onChange={(event) => setReason(event.target.value)} required />
          </label>
          {canSendNow ? (
            <button
              type="button"
              className="button button--primary"
              onClick={() =>
                run(() => props.actions.sendForApproval({ caseId: props.caseId, caseNumber: props.caseNumber, reason }))
              }
            >
              Send for approval
            </button>
          ) : null}
          {awaiting && props.canDecide ? (
            <div className="decision-buttons">
              <button
                type="button"
                className="button button--primary"
                onClick={() =>
                  run(() => props.actions.approveAndClose({ caseId: props.caseId, caseNumber: props.caseNumber, reason }))
                }
              >
                Approve and close
              </button>
              <button
                type="button"
                className="button"
                onClick={() =>
                  run(() => props.actions.requestChanges({ caseId: props.caseId, caseNumber: props.caseNumber, reason }))
                }
              >
                Request changes
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={() =>
                  run(() => props.actions.rejectCase({ caseId: props.caseId, caseNumber: props.caseNumber, reason }))
                }
              >
                Reject
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="muted">Automatic sending is off. Every response is sent by a person.</p>
    </div>
  );
}
