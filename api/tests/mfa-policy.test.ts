/**
 * The /mfa routing decision: a missing session goes to sign-in, a non-MFA role or an
 * already-satisfied session goes straight to /app, and only an MFA-owing role renders
 * the form (null). Extracted from the page so the security-relevant redirect rule is
 * covered by a test, not just by inspection.
 */
import { describe, expect, it } from "vitest";
import { mfaStepDestination } from "@/server/auth/require-auth";
import type { Actor } from "@/server/auth/require-auth";

const actor = (roles: Actor["roles"], mfaSatisfied = false): Actor => ({
  userId: "u1",
  label: "s@example.test",
  orgId: "o1",
  workspaceId: "w1",
  roles,
  mfaSatisfied,
});

describe("mfaStepDestination", () => {
  it("sends a missing session to sign-in", () => {
    expect(mfaStepDestination(null)).toBe("/");
  });

  it("sends a non-MFA role straight to /app", () => {
    expect(mfaStepDestination(actor(["request_handler"], false))).toBe("/app");
  });

  it("sends an already-satisfied MFA role to /app", () => {
    expect(mfaStepDestination(actor(["owner"], true))).toBe("/app");
    expect(mfaStepDestination(actor(["approver"], true))).toBe("/app");
  });

  it("renders the form only for an MFA-owing role", () => {
    expect(mfaStepDestination(actor(["owner"], false))).toBeNull();
    expect(mfaStepDestination(actor(["approver"], false))).toBeNull();
    expect(mfaStepDestination(actor(["workspace_admin"], false))).toBeNull();
  });
});
