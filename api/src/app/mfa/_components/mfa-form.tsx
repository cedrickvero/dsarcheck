"use client";

/**
 * The TOTP step: for a first-time MFA user this enrols (POST /api/auth/totp/enrol returns
 * the otpauth URI exactly once), shows the setup key + a link to open it in an authenticator
 * app, and then confirms with the 6-digit code (POST /api/auth/totp/verify). An
 * already-enrolled user just gets the code box.
 *
 * The failure message is generic: a wrong code, a replayed code and a missing enrolment all
 * return the same 401 from the API, so this form can only ever say "that didn't work".
 */
import { useEffect, useState } from "react";

function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/** The client-side code check, extracted so it is testable (the API would also refuse a
 *  malformed code, but the form must not send garbage). */
export function isValidVerificationCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

export function MfaForm({ enrolled, email }: { enrolled: boolean; email: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [setupFailed, setSetupFailed] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (enrolled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/totp/enrol", { method: "POST" });
        if (!res.ok) throw new Error(`enrol failed (${res.status})`);
        const data = (await res.json()) as { otpauthUri: string };
        if (cancelled) return;
        setOtpauth(data.otpauthUri);
        const uri = new URL(data.otpauthUri);
        setSecret(uri.searchParams.get("secret"));
      } catch {
        if (!cancelled) setSetupFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enrolled]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const value = code.trim();
    if (!isValidVerificationCode(value)) {
      setError(true);
      return;
    }

    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/auth/totp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      if (res.ok) {
        window.location.assign("/app");
        return;
      }
      setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="sign-in-form" onSubmit={submit}>
      {!enrolled && !setupFailed && (
        <>
          <p className="mfa-instruction">
            Add this account to your authenticator app, then enter the 6-digit code.
          </p>
          {secret ? (
            <p className="hint">
              Setup key: <code className="mfa-secret">{formatSecret(secret)}</code>
            </p>
          ) : (
            <p className="hint">Loading setup key…</p>
          )}
          {otpauth ? (
            <a className="hint" href={otpauth}>
              Open in authenticator app
            </a>
          ) : null}
        </>
      )}

      {setupFailed ? (
        <p className="hint">Could not start setup. Reload the page and try again.</p>
      ) : null}

      <label className="field">
        <span>{enrolled ? "Verification code" : "6-digit code"}</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          required
          autoFocus
        />
      </label>

      <button type="submit" className="button button--primary">
        {busy ? "Checking…" : enrolled ? "Verify" : "Confirm and continue"}
      </button>

      <p aria-live="polite" role="status" className="sign-in-status">
        {error ? "That code didn't work. Check your authenticator and try again." : ""}
      </p>

      <p className="hint">Signed in as {email}.</p>
    </form>
  );
}
