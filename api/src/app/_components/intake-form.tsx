"use client";

/**
 * The public intake form (docs/03 § H, Intake Form). Verbatim copy. The form is a native
 * POST to /api/intake so it works without JavaScript; the client-side validator mirrors the
 * prototype's field-level errors and only prevents the native submit when a field fails.
 */
import { useState } from "react";

interface IntakeType {
  value: string;
  label: string;
  desc: string;
}

const TYPES: IntakeType[] = [
  { value: "Access", label: "Access", desc: "Get a copy of the personal data we hold about you." },
  { value: "Rectification", label: "Rectification", desc: "Correct inaccurate or incomplete data." },
  { value: "Erasure", label: "Erasure", desc: "Ask us to delete your personal data." },
  { value: "Portability", label: "Portability", desc: "Receive your data in a machine-readable format." },
  { value: "Objection", label: "Objection", desc: "Object to how we use your data." },
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function FieldError(props: { message?: string }) {
  if (!props.message) return null;
  return (
    <span className="intake-error" role="alert">
      {props.message}
    </span>
  );
}

export function IntakeForm(props: { companyName: string }) {
  const [selected, setSelected] = useState("Access");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const fd = new FormData(e.currentTarget);
    const err: Record<string, string> = {};
    if (!String(fd.get("name") ?? "").trim()) err.name = "Enter your full name.";
    if (!EMAIL_RE.test(String(fd.get("email") ?? "").trim())) err.email = "Enter a valid email address, like name@example.com.";
    if (!String(fd.get("ident") ?? "").trim()) err.ident = "Enter an identifier so we can find your account.";
    if (!String(fd.get("details") ?? "").trim()) err.details = "Describe your request.";
    if (fd.get("consent") !== "on") err.consent = "You must agree before we can process your request.";
    if (fd.get("human") !== "on") err.human = "Complete the anti-spam check.";
    const files = fd.getAll("attachments").filter((v): v is File => v instanceof File);
    if (files.length > 5) {
      err.attachments = "Attach up to 5 files.";
    } else {
      for (const f of files) {
        if (f.size > 10 * 1024 * 1024) {
          err.attachments = `${f.name} is larger than 10 MB.`;
          break;
        }
        const ok = /\.(pdf|jpe?g|png)$/i.test(f.name) || ["application/pdf", "image/jpeg", "image/png"].includes(f.type);
        if (!ok) {
          err.attachments = `${f.name} is not a PDF, JPG or PNG.`;
          break;
        }
      }
    }
    setErrors(err);
    setTried(true);
    if (Object.keys(err).length > 0) e.preventDefault();
  };

  const errCount = Object.keys(errors).length;

  return (
    <form className="intake-form" action="/api/intake" method="post" encType="multipart/form-data" onSubmit={onSubmit} noValidate>
      {tried && errCount > 0 ? (
        <div className="intake-banner" role="alert">
          {errCount} field{errCount === 1 ? "" : "s"} need attention before you can submit.
        </div>
      ) : null}

      <fieldset className="intake-types">
        <legend>What would you like to do?</legend>
        <div className="intake-types-grid">
          {TYPES.map((t) => (
            <label key={t.value} className={selected === t.value ? "intake-type intake-type--sel" : "intake-type"}>
              <input type="radio" name="type" value={t.value} checked={selected === t.value} onChange={() => setSelected(t.value)} />
              <span className="intake-type-label">{t.label}</span>
              <span className="intake-type-desc">{t.desc}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="intake-grid">
        <label className="field">
          <span>Full name</span>
          <input name="name" autoComplete="name" />
          <FieldError message={errors.name} />
        </label>
        <label className="field">
          <span>Email address</span>
          <input type="email" name="email" autoComplete="email" />
          <FieldError message={errors.email} />
        </label>
      </div>

      <div className="field">
        <span>Account identifier</span>
        <span className="intake-hint">Helps us find your account. Use the email you signed up with, a customer ID from an invoice, or a phone number.</span>
        <div className="intake-ident">
          <select name="identKind" aria-label="Identifier type" defaultValue="Customer ID">
            <option>Customer ID</option>
            <option>Account email</option>
            <option>Phone number</option>
            <option>Other reference</option>
          </select>
          <input name="ident" aria-label="Identifier" />
        </div>
        <FieldError message={errors.ident} />
      </div>

      <label className="field">
        <span>Request details</span>
        <textarea name="details" rows={4} />
        <FieldError message={errors.details} />
      </label>

      <div className="intake-attachments">
        <label className="intake-attachments-label">
          <span className="intake-attachments-icon" aria-hidden="true">↑</span>
          <span className="intake-attachments-text">Attachments (optional). Do not upload identity documents unless we ask for them.</span>
          <span className="intake-attachments-btn">Choose files</span>
          <input type="file" multiple name="attachments" accept=".pdf,.jpg,.jpeg,.png" />
        </label>
        <FieldError message={errors.attachments} />
      </div>

      <label className="intake-consent">
        <input type="checkbox" name="consent" value="on" />
        <span>
          I agree that {props.companyName} may use the information in this form to verify my identity and handle my request.
        </span>
      </label>
      <FieldError message={errors.consent} />

      <label className="intake-consent">
        <input type="checkbox" name="human" value="on" />
        <span>I am not a robot · Click to verify</span>
      </label>
      <FieldError message={errors.human} />

      <div className="intake-submit">
        <button type="submit" className="button button--primary">
          Submit request
        </button>
        <span className="intake-hint">We will email a reference number and a link to verify your identity.</span>
      </div>
    </form>
  );
}
