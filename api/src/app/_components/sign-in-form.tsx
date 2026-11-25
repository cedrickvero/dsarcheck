"use client";

/**
 * Magic-link sign-in form.
 *
 * Works WITHOUT JavaScript: it is a plain form posting to the route (which responds with a
 * 303 to `/?sent=1`). With JavaScript it intercepts the submit and fetches, showing the
 * message inline instead of navigating. The button is never disabled - a disabled button
 * cannot receive focus, so a user gets no feedback on why they cannot proceed; `required`
 * on the input is the validation, and an empty submit simply does not fire.
 *
 * The response is deliberately generic either way: the API returns the SAME result for a
 * known and an unknown address (no enumeration oracle).
 */
import { useState } from "react";

export function SignInForm({ initiallySent = false }: { initiallySent?: boolean }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(initiallySent);
  const [error, setError] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;

    setError(false);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      setSent(true);
    } catch {
      setError(true);
    }
  };

  return (
    <form className="sign-in-form" action="/api/auth/magic-link" method="post" onSubmit={submit}>
      <label className="field">
        <span>Work email</span>
        <input
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          required
          autoFocus
        />
      </label>

      <button type="submit" className="button">
        Email me a sign-in link
      </button>

      <p aria-live="polite" role="status" className="sign-in-status">
        {sent
          ? "If that address has a workspace, a sign-in link is on its way. Open the link in the email to continue."
          : error
            ? "Something went wrong sending the link. Try again."
            : ""}
      </p>

      <p className="hint">
        Development build — sign in with a seeded demo account:{" "}
        <code>priya@lumen.io</code>, <code>daniel@lumen.io</code> or{" "}
        <code>sara@lumen.io</code>. The link is delivered to MailHog (this host, port 8025),
        not a real inbox.
      </p>
    </form>
  );
}
