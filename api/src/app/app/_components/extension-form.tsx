"use client";

/**
 * G15 — the "Extend deadline" control + the approver's approve/reject actions.
 *
 * When the workspace setting "approver reviews extensions" is OFF (default), extending applies
 * immediately. When ON, the request lands in a pending sub-state (`extensionRequestedMonths`)
 * and an Approver approves or rejects here. Every path is reason-required and goes through the
 * shared ReasonDialog (AGENTS.md: one dialog for every reason-required action).
 */
import { useState } from "react";
import { ReasonDialog } from "./reason-dialog";

export interface ExtensionActions {
  extendDeadline: (input: { caseId: string; caseNumber: string; months: number; reason: string }) => Promise<{ ok: boolean; message?: string }>;
  approveExtension: (input: { caseId: string; caseNumber: string; reason: string }) => Promise<{ ok: boolean; message?: string }>;
  rejectExtension: (input: { caseId: string; caseNumber: string; reason: string }) => Promise<{ ok: boolean; message?: string }>;
}

const CLOSED = new Set(["Completed", "Rejected"]);

export function ExtensionForm(props: {
  caseId: string;
  caseNumber: string;
  status: string;
  extensionMonths: number;
  extensionRequestedMonths: number | null;
  canExtend: boolean;
  canApprove: boolean;
  actions: ExtensionActions;
}) {
  const [mode, setMode] = useState<null | "extend" | "approve" | "reject">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canExtend =
    props.canExtend && !CLOSED.has(props.status) && props.extensionMonths < 2 && props.extensionRequestedMonths == null;
  const pending = props.extensionRequestedMonths != null;

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.message ?? "Something went wrong.");
    else setMode(null);
  }

  return (
    <div className="extension-form">
      {canExtend ? (
        <button type="button" className="button" onClick={() => setMode("extend")}>
          Extend deadline
        </button>
      ) : null}

      {pending ? (
        <p className="extension-pending" role="status">
          Extension of {props.extensionRequestedMonths}{" "}
          {props.extensionRequestedMonths === 1 ? "month" : "months"} awaiting approval.
        </p>
      ) : null}

      {pending && props.canApprove ? (
        <>
          <button type="button" className="button button--primary" onClick={() => setMode("approve")}>
            Approve extension
          </button>
          <button type="button" className="button button-ghost" onClick={() => setMode("reject")}>
            Reject extension
          </button>
        </>
      ) : null}

      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}

      <ReasonDialog
        open={mode === "extend"}
        title="Extend the deadline"
        description="This moves the statutory deadline and is recorded in the audit log."
        confirmLabel="Extend deadline"
        option={{
          label: "By",
          name: "months",
          values: [
            { value: "1", label: "+1 month" },
            { value: "2", label: "+2 months" },
          ],
          initial: "1",
        }}
        busy={busy}
        onCancel={() => setMode(null)}
        onConfirm={(input) =>
          run(() =>
            props.actions.extendDeadline({
              caseId: props.caseId,
              caseNumber: props.caseNumber,
              months: Number(input.option ?? "1"),
              reason: input.reason,
            }),
          )
        }
      />

      <ReasonDialog
        open={mode === "approve"}
        title="Approve the extension"
        description="Applying the extension moves the deadline and notifies the requester."
        confirmLabel="Approve extension"
        busy={busy}
        onCancel={() => setMode(null)}
        onConfirm={(input) =>
          run(() =>
            props.actions.approveExtension({ caseId: props.caseId, caseNumber: props.caseNumber, reason: input.reason }),
          )
        }
      />

      <ReasonDialog
        open={mode === "reject"}
        title="Reject the extension"
        description="The deadline is unchanged and the requester is not notified."
        confirmLabel="Reject extension"
        busy={busy}
        onCancel={() => setMode(null)}
        onConfirm={(input) =>
          run(() =>
            props.actions.rejectExtension({ caseId: props.caseId, caseNumber: props.caseNumber, reason: input.reason }),
          )
        }
      />
    </div>
  );
}
