"use client";

/**
 * Magic-link sign-in form.
 *
 * The response is deliberately generic: the API returns the SAME result for a known and an
 * unknown address (no enumeration oracle), so this form can only ever say "check your
 * email". The only real error is a network failure.
 */
import { useState } from "react";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;

    setState("idle");
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      // The route returns 200 for both known and unknown addresses, by design.
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      setState("sent");
    } catch {
      setState("error");
    }
  };

  return (
    <form className="sign-in-form" onSubmit={submit}>
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

      <button type="submit" className="button" disabled={!email.trim()}>
        Email me a sign-in link
      </button>

      <p aria-live="polite" role="status" className="sign-in-status">
        {state === "sent"
          ? "If that address has a workspace, a sign-in link is on its way. Open the link in the email to continue."
          : state === "error"
            ? "Something went wrong sending the link. Try again."
            : ""}
      </p>

      <p className="hint">
        Development build: the email is delivered to MailHog, not a real inbox — open the
        MailHog web UI to read it.
      </p>
    </form>
  );
}
