"use client";

/**
 * One dialog for every action that requires a reason.
 *
 * AGENTS.md requires a single ReasonDialog component across the product, so this is it:
 * the caller supplies the copy, the optional choice (e.g. "New owner") and the handler.
 *
 * Built on <dialog>: the browser then provides the focus trap, Escape-to-close, inertness
 * of the page behind it, and focus return to the trigger. Rolling those by hand is how
 * dialogs end up trapping focus wrongly; the agreed extras are the 44px targets and the
 * teal focus ring, which come from the design system classes.
 */
import { useEffect, useRef, useState } from "react";

export interface ReasonDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** Renders a <select> above the reason when provided. */
  option?: { label: string; name: string; values: { value: string; label: string }[]; initial: string };
  /** A reason shorter than this is refused by the dialog itself. */
  minReasonLength?: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (input: { reason: string; option: string | null }) => void;
}

export function ReasonDialog(props: ReasonDialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [reason, setReason] = useState("");
  const [option, setOption] = useState(props.option?.initial ?? "");
  const min = props.minReasonLength ?? 3;
  const valid = reason.trim().length >= min;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (props.open && !dialog.open) {
      dialog.showModal();
      setReason("");
      setOption(props.option?.initial ?? "");
    }
    if (!props.open && dialog.open) dialog.close();
  }, [props.open, props.option?.initial]);

  if (!props.open) return null;

  return (
    <dialog
      ref={ref}
      className="reason-dialog"
      aria-labelledby="reason-dialog-title"
      aria-describedby="reason-dialog-desc"
      onCancel={(event) => {
        event.preventDefault();
        if (!props.busy) props.onCancel();
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !props.busy) props.onConfirm({ reason: reason.trim(), option: props.option ? option : null });
        }}
      >
        <h2 id="reason-dialog-title">{props.title}</h2>
        <p id="reason-dialog-desc">{props.description}</p>

        {props.option ? (
          <label className="field">
            <span>{props.option.label}</span>
            <select
              name={props.option.name}
              value={option}
              onChange={(event) => setOption(event.target.value)}
              disabled={props.busy}
            >
              {props.option.values.map((value) => (
                <option key={value.value} value={value.value}>
                  {value.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="field">
          <span>{props.reasonLabel ?? "Reason"}</span>
          <textarea
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={props.reasonPlaceholder}
            rows={3}
            autoFocus
            disabled={props.busy}
            aria-describedby="reason-dialog-hint"
          />
        </label>
        <p id="reason-dialog-hint" className="hint">
          Recorded in the audit log for every case in this action.
        </p>

        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={props.onCancel} disabled={props.busy}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={!valid || props.busy}>
            {props.busy ? "Working…" : props.confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
