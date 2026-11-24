import { describe, expect, it } from "vitest";
import { RESPONSE_TEMPLATES, primaryCta, respText } from "@/domain/respText";
import { RECEIVED, SOURCE_NAMES } from "./domain-case";
import type { ErasureOutcome } from "@/domain/types";

/**
 * Response copy is final: these assertions are contract tests, not formatting
 * checks. Anything that changes a customer-visible sentence should have to change
 * this file.
 */
const sources = Object.entries(SOURCE_NAMES).map(([key, name]) => ({ key, name }));
const client = { sender: "Lumen Analytics Privacy" };

function caseWith(overrides: Partial<Parameters<typeof respText>[0]> = {}) {
  return {
    id: "DSAR-2026-00418",
    name: "Maya Lindqvist",
    type: "Access",
    receivedAt: RECEIVED,
    template: "Access — data copy enclosed" as string | null,
    systems: [{ key: "pg", outcome: null }] as {
      key: string;
      outcome: ErasureOutcome | null;
    }[],
    ...overrides,
  };
}

describe("respText()", () => {
  it("asks for a template instead of inventing a message", () => {
    expect(respText(caseWith({ template: null }), client, sources)).toBe(
      "Select a response template to preview the message.",
    );
    expect(respText(caseWith({ template: "" }), client, sources)).toBe(
      "Select a response template to preview the message.",
    );
  });

  it("greets by first name, names the type and quotes the reference", () => {
    const text = respText(caseWith({ type: "Rectification" }), client, sources);
    expect(text.startsWith("Dear Maya,")).toBe(true);
    expect(text).toContain(
      "We have completed your rectification request received on 24 Sep 2026 (reference DSAR-2026-00418).",
    );
    expect(text).toContain("We searched 1 systems where your data may be held.");
    expect(text).toContain("The download link expires 7 days after it is first opened.");
    expect(text).toContain("Some information has been removed because it relates to other people");
    expect(text.endsWith("\n\nLumen Analytics Privacy")).toBe(true);
  });

  it("lists erasure outcomes by system name, dropping empty groups", () => {
    const text = respText(
      caseWith({
        type: "Erasure",
        template: "Erasure — confirmation of outcomes",
        systems: [
          { key: "pg", outcome: "Deleted" },
          { key: "stripe", outcome: "Retained under exception" },
          { key: "hubspot", outcome: "Deleted" },
          { key: "zendesk", outcome: null },
          { key: "intercom", outcome: "Suppressed / anonymized" },
        ],
      }),
      client,
      sources,
    );

    expect(text).toContain("The outcome in each system we checked:");
    expect(text).toContain("• Deleted: Production database, HubSpot");
    expect(text).toContain(
      "• Retained under legal obligation: Stripe",
    );
    expect(text).toContain("• Anonymized: Intercom");
    expect(text).not.toContain("No data found");
    // A system with no outcome is simply not claimed either way.
    expect(text).not.toContain("Zendesk");
    expect(text).toContain(
      "Where we keep data under a legal obligation, we keep only what that obligation requires",
    );
  });

  it("lists Not found systems under 'No data found' when they exist", () => {
    const text = respText(
      caseWith({
        type: "Erasure",
        template: "Erasure — confirmation of outcomes",
        systems: [
          { key: "pg", outcome: "Not found" },
          { key: "stripe", outcome: "Action required" },
        ],
      }),
      client,
      sources,
    );
    expect(text).toContain("• No data found: Production database");
    // Action required is not a completed outcome and must not be promised.
    expect(text).not.toContain("Stripe");
  });

  it("keeps the refusal template's legal wording and leaves the reason as a placeholder", () => {
    const text = respText(
      caseWith({ template: "Refusal — documented reason" }),
      client,
      sources,
    );
    expect(text).toContain("We are unable to complete your request received on 24 Sep 2026");
    expect(text).toContain("[Documented reason]");
    expect(text).toContain("You have the right to complain to a supervisory authority.");
  });

  it("falls back to the generic template for every non-erasure, non-refusal template", () => {
    const generic = respText(caseWith({ template: "Portability — machine-readable export" }), client, sources);
    expect(generic).toContain("We searched 1 systems");
    expect(generic).not.toContain("• Deleted:");
  });

  it("never claims guaranteed compliance or automatic legal determination", () => {
    const all = RESPONSE_TEMPLATES.map((template) =>
      respText(caseWith({ template }), client, sources),
    ).join("\n");
    expect(all).not.toMatch(/guaranteed compliance/i);
    expect(all).not.toMatch(/automatic legal determination/i);
    expect(all).not.toMatch(/AI-approved/i);
  });
});

describe("primaryCta()", () => {
  it("offers Start verification for a new case", () => {
    const cta = primaryCta({ status: "New", risk: "Low", isApprover: false, openCheckCount: 0 });
    expect(cta).toMatchObject({
      label: "Start verification",
      icon: "shield",
      tab: "identity",
      enabled: true,
      note: "",
    });
  });

  it("blocks a high-risk identity approval for a handler, with the reason", () => {
    const blocked = primaryCta({
      status: "Verifying",
      risk: "High",
      isApprover: false,
      openCheckCount: 0,
    });
    expect(blocked.enabled).toBe(false);
    expect(blocked.label).toBe("Approve identity");
    expect(blocked.note).toBe("High-risk: approver role required");

    const allowed = primaryCta({
      status: "Verifying",
      risk: "High",
      isApprover: true,
      openCheckCount: 0,
    });
    expect(allowed.enabled).toBe(true);
    expect(allowed.note).toBe("");
  });

  it("blocks Send for approval while checks remain, and counts them", () => {
    const open = primaryCta({
      status: "In progress",
      risk: "Low",
      isApprover: false,
      openCheckCount: 2,
    });
    expect(open.label).toBe("Send for approval");
    expect(open.enabled).toBe(false);
    expect(open.note).toBe("2 items remain");

    const one = primaryCta({
      status: "Extended",
      risk: "Low",
      isApprover: false,
      openCheckCount: 1,
    });
    expect(one.enabled).toBe(false);
    expect(one.note).toBe("1 item remains");

    const clear = primaryCta({
      status: "In progress",
      risk: "Low",
      isApprover: false,
      openCheckCount: 0,
    });
    expect(clear.enabled).toBe(true);
  });

  it("blocks Approve and close for a non-approver and for open items, in that order", () => {
    const handler = primaryCta({
      status: "Awaiting approval",
      risk: "Low",
      isApprover: false,
      openCheckCount: 0,
    });
    expect(handler.label).toBe("Approve and close");
    expect(handler.enabled).toBe(false);
    expect(handler.note).toBe("Approver role required");

    const approver = primaryCta({
      status: "Awaiting approval",
      risk: "Low",
      isApprover: true,
      openCheckCount: 3,
    });
    expect(approver.enabled).toBe(false);
    expect(approver.note).toBe("Resolve open items first");

    const ok = primaryCta({
      status: "Awaiting approval",
      risk: "Low",
      isApprover: true,
      openCheckCount: 0,
    });
    expect(ok.enabled).toBe(true);
  });

  it("points a closed case at the evidence pack", () => {
    for (const status of ["Completed", "Rejected"] as const) {
      const cta = primaryCta({ status, risk: "Low", isApprover: false, openCheckCount: 0 });
      expect(cta.label).toBe("Download evidence pack");
      expect(cta.icon).toBe("download");
      expect(cta.tab).toBe("evidence");
      expect(cta.enabled).toBe(true);
    }
  });
});
