/**
 * The TOTP step form, rendered to markup: a first-time user gets the setup key and a
 * confirm button; an already-enrolled user gets only the code box. The code input is a
 * numeric one-time-code field, and the failure copy is generic (the API never reveals
 * which of wrong-code / replay / no-enrolment failed).
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MfaForm, isValidVerificationCode } from "@/app/mfa/_components/mfa-form";

describe("MfaForm", () => {
  it("a first-time user sees setup instructions and a confirm button", () => {
    const html = renderToStaticMarkup(<MfaForm enrolled={false} email="sara@lumen.io" />);
    expect(html).toContain("Add this account to your authenticator app");
    expect(html).toContain("Confirm and continue");
    expect(html).toContain("6-digit code");
  });

  it("an already-enrolled user sees only the verification box", () => {
    const html = renderToStaticMarkup(<MfaForm enrolled={true} email="sara@lumen.io" />);
    expect(html).toContain("Verification code");
    expect(html).toContain(">Verify<");
    expect(html).not.toContain("Confirm and continue");
    expect(html).not.toContain("Add this account");
    expect(html).not.toContain("Open in authenticator app");
  });

  it("the code input is a numeric one-time-code field", () => {
    const html = renderToStaticMarkup(<MfaForm enrolled={true} email="sara@lumen.io" />);
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('autoComplete="one-time-code"');
    expect(html).toContain('pattern="[0-9]{6}"');
    expect(html).toContain('maxLength="6"');
  });

  it("shows who the code is for", () => {
    const html = renderToStaticMarkup(<MfaForm enrolled={true} email="sara@lumen.io" />);
    expect(html).toContain("Signed in as sara@lumen.io.");
  });
});

describe("isValidVerificationCode", () => {
  it("accepts exactly six digits", () => {
    expect(isValidVerificationCode("123456")).toBe(true);
    expect(isValidVerificationCode(" 123456 ")).toBe(true);
  });

  it("refuses anything that is not six digits", () => {
    expect(isValidVerificationCode("12345")).toBe(false);
    expect(isValidVerificationCode("1234567")).toBe(false);
    expect(isValidVerificationCode("12345a")).toBe(false);
    expect(isValidVerificationCode("")).toBe(false);
  });
});
