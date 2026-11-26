"use client";

/**
 * Share-link issuer for one evidence-pack version. The link is 24h, single-use and bound to
 * this artifact + workspace. POSTs to the signed-link route (same-origin fetch carries the
 * session cookie), then shows the resulting absolute URL for copy. The raw token is returned
 * once; the server stores only its hash.
 */
import { useState } from "react";

const RECIPIENT_TYPES = ["requester", "regulator", "counsel", "other"] as const;

export function ShareLinkButton(props: { artifactId: string }) {
  const [open, setOpen] = useState(false);
  const [recipientType, setRecipientType] = useState<string>("requester");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const res = await fetch(`/api/evidence/pack/${props.artifactId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientType, reason }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
      if (!res.ok) {
        setError(body.error?.message ?? "Could not issue a link.");
        return;
      }
      setLink(body.url ?? null);
      setOpen(false);
    } catch {
      setError("Could not issue a link.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
  };

  if (link) {
    return (
      <span className="share-link-result">
        <input readOnly value={link} aria-label="Share link" />
        <button type="button" className="button button--primary" onClick={copy}>
          Copy
        </button>
        <button type="button" className="button" onClick={() => setLink(null)}>
          New
        </button>
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" className="button" onClick={() => setOpen(true)}>
        Share link
      </button>
    );
  }

  return (
    <span className="share-link-form">
      <select value={recipientType} onChange={(e) => setRecipientType(e.target.value)} aria-label="Recipient type">
        {RECIPIENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        aria-label="Reason"
      />
      <button type="button" className="button button--primary" onClick={submit} disabled={busy || reason.trim().length < 3}>
        {busy ? "Issuing…" : "Issue"}
      </button>
      <button type="button" className="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
