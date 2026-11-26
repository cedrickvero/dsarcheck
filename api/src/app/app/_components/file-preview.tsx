"use client";

/**
 * The in-app file preview (docs/03 E4a): an original file is blurred (6px) with
 * "Preview hidden. The original contains unredacted personal data." and an
 * "Open original · logged" reason dialog; the redacted export renders unblurred. The bytes
 * come from the authenticated, workspace-scoped content endpoint (session cookie, same-origin).
 */
import { useState } from "react";

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

export type OpenOriginalAction = (input: { caseId: string; caseNumber: string; fileId: string; reason: string }) => Promise<{ ok: boolean; message?: string }>;

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
  const [blurred, setBlurred] = useState(!props.file.isRedactedExport);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const src = `/api/cases/${props.caseId}/files/${props.file.id}/content`;
  const isImage = props.file.type.startsWith("image/");
  const isPdf = props.file.type === "application/pdf";

  const open = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await props.openOriginal({ caseId: props.caseId, caseNumber: props.caseNumber, fileId: props.file.id, reason });
    setBusy(false);
    if (!result.ok) setError(result.message ?? "Could not open the original.");
    else {
      setBlurred(false);
      setReason("");
    }
  };

  if (!isImage && !isPdf) {
    return <p className="muted">Preview not available for this file type.</p>;
  }

  return (
    <div className="file-preview">
      <div className="file-preview-header">
        <span className="system-name">{props.file.isRedactedExport ? "Redacted export" : "Original v1 · access-controlled"}</span>
      </div>
      <div className="file-preview-body" style={blurred ? { filter: "blur(6px)" } : undefined}>
        {isImage ? <img src={src} alt={props.file.name} /> : <iframe src={src} title={props.file.name} />}
      </div>
      {blurred ? (
        <div className="file-preview-gate">
          <p className="muted">Preview hidden. The original contains unredacted personal data.</p>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" required />
          <button type="button" className="button button--primary" onClick={open} disabled={busy || reason.trim().length < 3}>
            {busy ? "Opening…" : "Open original · logged"}
          </button>
        </div>
      ) : null}
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
