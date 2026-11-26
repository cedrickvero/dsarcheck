"use client";

/**
 * The end-to-end redacted-export flow: pick the human-produced _redacted_v2 file, mint a
 * presigned PUT via the R2 contract, upload the bytes, compute the sha256 client-side, then
 * record the export (a version-2 case_files row + finalExportDone) through the server action.
 * The presigned PUT signature pins the SSE header (AES256, the dev default), so the client
 * echoes it verbatim.
 */
import { useRef, useState } from "react";

export type UploadRedactedExportAction = (input: { caseId: string; caseNumber: string; contentType: string }) => Promise<{
  ok: boolean;
  message?: string;
  data?: { uploadUrl: string; objectKey: string };
}>;

export type RecordRedactedExportAction = (input: {
  caseId: string;
  caseNumber: string;
  objectKey: string;
  sha256: string;
  name: string;
  type: string;
  sizeBytes: number;
}) => Promise<{ ok: boolean; message?: string }>;

export function RedactedExportUpload(props: {
  caseId: string;
  caseNumber: string;
  issueUpload: UploadRedactedExportAction;
  recordExport: RecordRedactedExportAction;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (file: File) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const type = file.type || "application/octet-stream";
      const mint = await props.issueUpload({ caseId: props.caseId, caseNumber: props.caseNumber, contentType: type });
      if (!mint.ok || !mint.data) {
        setError(mint.message ?? "Could not prepare the upload.");
        return;
      }
      const put = await fetch(mint.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": type, "x-amz-server-side-encryption": "AES256" },
        body: file,
      });
      if (!put.ok) {
        setError("The upload to storage failed.");
        return;
      }
      const sha256 = await sha256OfFile(file);
      const rec = await props.recordExport({
        caseId: props.caseId,
        caseNumber: props.caseNumber,
        objectKey: mint.data.objectKey,
        sha256,
        name: file.name,
        type,
        sizeBytes: file.size,
      });
      if (!rec.ok) setError(rec.message ?? "Could not record the export.");
    } catch {
      setError("The upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onPick(file);
          event.target.value = "";
        }}
      />
      <button type="button" className="button button--primary" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? "Uploading…" : "Generate final redacted export"}
      </button>
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

async function sha256OfFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
