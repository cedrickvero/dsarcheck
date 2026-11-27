"use client";

/**
 * G5 — the owner-facing support-access banner (docs/05 § Admin rules).
 *
 * A Requested grant renders as a banner asking the owner to Approve or Decline; an Active
 * grant renders as a persistent bar with "End access". Every decision is reason-required
 * and goes through the shared ReasonDialog. Only owners/workspace-admins reach this — the
 * page only renders it for those roles.
 */
import { useState } from "react";
import { ReasonDialog } from "./reason-dialog";

export interface SupportGrantItem {
  id: string;
  staffLabel: string;
  scope: string;
  reason: string;
  status: "Requested" | "Active" | "Declined" | "Ended" | "Expired";
  expiresLabel: string | null;
}

export interface SupportAccessActions {
  approve: (input: { grantId: string; reason: string }) => Promise<{ ok: boolean; message?: string }>;
  decline: (input: { grantId: string; reason: string }) => Promise<{ ok: boolean; message?: string }>;
  end: (input: { grantId: string; reason: string }) => Promise<{ ok: boolean; message?: string }>;
}

export function SupportAccessBanner(props: {
  workspaceName: string;
  grants: SupportGrantItem[];
  actions: SupportAccessActions;
}) {
  const pending = props.grants.filter((g) => g.status === "Requested");
  const active = props.grants.filter((g) => g.status === "Active");
  const [dialog, setDialog] = useState<{ mode: "approve" | "decline" | "end"; grantId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pending.length === 0 && active.length === 0) return null;

  const current = props.grants.find((g) => g.id === dialog?.grantId);

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.message ?? "Something went wrong.");
    else setDialog(null);
  }

  return (
    <div className="support-access">
      {active.map((g) => (
        <div className="support-access-bar" key={g.id} role="status">
          <p>Privacyspace support has access until {g.expiresLabel}.</p>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => setDialog({ mode: "end", grantId: g.id })}
          >
            End access
          </button>
        </div>
      ))}

      {pending.map((g) => (
        <div className="support-access-request" key={g.id}>
          <p>
            {g.staffLabel} from Privacyspace asks to open {props.workspaceName} for 24 hours · {g.scope} · Reason:{" "}
            {g.reason}
          </p>
          <div className="dialog-actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => setDialog({ mode: "approve", grantId: g.id })}
            >
              Approve
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => setDialog({ mode: "decline", grantId: g.id })}
            >
              Decline
            </button>
          </div>
        </div>
      ))}

      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}

      <ReasonDialog
        open={dialog?.mode === "approve"}
        title="Approve support access"
        description={`Grant ${current?.staffLabel ?? "support"} access to ${props.workspaceName} for 24 hours. Recorded in the workspace audit log.`}
        confirmLabel="Approve access"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={(input) => run(() => props.actions.approve({ grantId: dialog!.grantId, reason: input.reason }))}
      />

      <ReasonDialog
        open={dialog?.mode === "decline"}
        title="Decline support access"
        description="The request is refused and your reason is recorded in the audit log."
        confirmLabel="Decline access"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={(input) => run(() => props.actions.decline({ grantId: dialog!.grantId, reason: input.reason }))}
      />

      <ReasonDialog
        open={dialog?.mode === "end"}
        title="End support access"
        description="Privacyspace support loses access immediately. Recorded in the audit log."
        confirmLabel="End access"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={(input) => run(() => props.actions.end({ grantId: dialog!.grantId, reason: input.reason }))}
      />
    </div>
  );
}
