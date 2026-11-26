"use client";

/**
 * The in-app file preview (docs/03 E4a / docs/05 § Redaction rules). An original file is
 * HIDDEN (no bytes fetched) until "Open original · logged" writes the reason + audit and mints
 * a short-lived signed URL — the unredacted bytes never reach the browser before that gate. A
 * redacted export renders directly (it is already safe). The redacted-export bytes come from
 * the authenticated, workspace-scoped content endpoint (session cookie, same-origin), which
 * refuses originals.
 */
import { useState } from "react";
import { ReasonDialog } from "./reason-dialog";

/** The file shape the preview needs; structurally identical to the server's CollectionFile. */
interface PreviewFile {
  id: string;
  sourceKey: string | null;
  name: string;
  type: string;
  sizeBytes: number;
  needsRedaction: boolean;
  isRedactedExport: boolean;
}

export type OpenOriginalAction = (input: { caseId: string; caseNumber: string; fileId: string; reason: string }) => Promise<{
  ok: boolean;
  message?: string;
  data?: { url: string };
}>;

export function CollectionFiles(props: {
  caseId: string;
  caseNumber: string;
  files: PreviewFile[];
  openOriginal: OpenOriginalAction;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = props.files.find((f) => f.id === selectedId) ?? null;

  return (
    <div>
      <ul className="file-list">
        {props.files.map((f) => (
          <li key={f.id}>
            <button type="button" className="file-select" onClick={() => setSelectedId(f.id)} aria-pressed={selectedId === f.id}>
              <span className="system-name">{f.name}</span>
              <span className="system-sub">
                {f.sourceKey ? `${f.sourceKey} · ` : ""}
                {f.type}
                {f.sizeBytes ? ` · ${f.sizeBytes} B` : ""}
              </span>
            </button>
            {f.needsRedaction ? (
              <span className="status" data-status="Action required">
                Needs redaction
              </span>
            ) : null}
            {f.isRedactedExport ? (
              <span className="status" data-status="Completed">
                Redacted export
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {selected ? (
        <FilePreview caseId={props.caseId} caseNumber={props.caseNumber} file={selected} openOriginal={props.openOriginal} />
      ) : null}
    </div>
  );
}

export function FilePreview(props: { caseId: string; caseNumber: string; file: PreviewFile; openOriginal: OpenOriginalAction }) {
  const [openedUrl, setOpenedUrl] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRedacted = props.file.isRedactedExport;
  const isImage = props.file.type.startsWith("image/");
  const isPdf = props.file.type === "application/pdf";

  // Redacted export: safe to serve via the content endpoint. Original: only the signed URL
  // minted after the reason + audit — never the content endpoint (which refuses originals).
  const contentSrc = isRedacted ? `/api/cases/${props.caseId}/files/${props.file.id}/content` : openedUrl;

  const open = async ({ reason }: { reason: string }) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await props.openOriginal({ caseId: props.caseId, caseNumber: props.caseNumber, fileId: props.file.id, reason });
    setBusy(false);
    if (!result.ok || !result.data) setError(result.message ?? "Could not open the original.");
    else {
      setOpenedUrl(result.data.url);
      setDialogOpen(false);
    }
  };

  if (!isImage && !isPdf) {
    return <p className="muted">Preview not available for this file type.</p>;
  }

  return (
    <div className="file-preview">
      <div className="file-preview-header">
        <span className="system-name">{isRedacted ? "Redacted export" : "Original v1 · access-controlled"}</span>
      </div>
      {contentSrc ? (
        <div className="file-preview-body">
          {isImage ? <img src={contentSrc} alt={props.file.name} /> : <iframe src={contentSrc} title={props.file.name} />}
        </div>
      ) : (
        <div className="file-preview-body file-preview-hidden" aria-hidden="true">
          <span className="muted">Preview hidden</span>
        </div>
      )}
      {!isRedacted && !openedUrl ? (
        <div className="file-preview-gate">
          <p className="muted">Preview hidden. The original contains unredacted personal data.</p>
          <button type="button" className="button button--primary" onClick={() => setDialogOpen(true)}>
            Open original · logged
          </button>
        </div>
      ) : null}
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
      <ReasonDialog
        open={dialogOpen}
        title="Open original file"
        description={`Opening "${props.file.name}" records this reason in the audit log for the case.`}
        confirmLabel="Open original"
        reasonLabel="Reason"
        reasonPlaceholder="Why do you need to view the original?"
        minReasonLength={3}
        busy={busy}
        onCancel={() => setDialogOpen(false)}
        onConfirm={open}
      />
    </div>
  );
}
