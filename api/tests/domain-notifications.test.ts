import { describe, expect, it } from "vitest";
import {
  bellAriaLabel,
  deriveNotifications,
  unreadBadge,
} from "@/domain/notifications";
import { NOW, SOURCE_NAMES, mkCase, system, systems } from "./domain-case";

const derive = (
  overwrites: Parameters<typeof mkCase>[0][],
  role: "Handler" | "Approver" = "Handler",
  read: Record<string, boolean> = {},
) =>
  deriveNotifications({
    role,
    cases: overwrites.map((o) => mkCase(o)),
    now: NOW,
    sourceNames: SOURCE_NAMES,
    read,
  });

describe("deriveNotifications()", () => {
  it("gives a handler a New-request notification", () => {
    const list = derive([{ status: "New" }]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "DSAR-2026-00418nw",
      kind: "nw",
      icon: "inbox",
      tone: "info",
      title: "New request",
      sub: "Access from Maya Lindqvist arrived through the portal.",
      meta: "DSAR-2026-00418 · 11 days left",
      tab: "overview",
      unread: true,
    });
  });

  it("never shows approver-only items to a handler", () => {
    const list = derive([{ status: "Awaiting approval" }, { status: "Verifying", risk: "High" }]);
    expect(list.some((n) => n.kind === "ap")).toBe(false);
    expect(list.some((n) => n.kind === "hr")).toBe(false);
  });

  it("gives an approver the sign-off and high-risk items, and nothing handlerish", () => {
    const list = derive(
      [{ status: "Awaiting approval" }, { status: "Verifying", risk: "High" }, { status: "New" }],
      "Approver",
    );
    expect(list.map((n) => n.kind).sort()).toEqual(["ap", "hr"]);
    const ap = list.find((n) => n.kind === "ap");
    expect(ap?.title).toBe("Approval needed");
    expect(ap?.sub).toBe("Access request from Maya Lindqvist is ready for sign-off.");
    expect(ap?.tone).toBe("warn");

    const hr = list.find((n) => n.kind === "hr");
    expect(hr?.title).toBe("High-risk identity check");
    expect(hr?.tab).toBe("identity");
    expect(hr?.tone).toBe("bad");
  });

  it("does not raise a high-risk item for an approver once identity is no longer pending", () => {
    const list = derive([{ status: "In progress", risk: "High" }], "Approver");
    expect(list).toEqual([]);
  });

  it("raises 'Extension requested' from the pending flag, not the latest audit action", () => {
    const list = derive(
      [{ status: "In progress", extensionRequestedMonths: 2, lastAuditAction: "Open original file" }],
      "Approver",
    );
    const ex = list.find((n) => n.kind === "ex");
    expect(ex?.title).toBe("Extension requested");
    expect(ex?.sub).toContain("2 months");
    expect(ex?.tab).toBe("overview");

    // A handler never sees the approver's extension item.
    expect(
      derive([{ status: "In progress", extensionRequestedMonths: 2 }]).some((n) => n.kind === "ex"),
    ).toBe(false);
  });

  it("surfaces 'Changes requested' from the last audit action, with the approver's reason", () => {
    const list = derive([
      {
        lastAuditAction: "Changes requested",
        lastAuditReason: "Response overstates what was deleted.",
      },
    ]);
    const cr = list.find((n) => n.kind === "cr");
    expect(cr?.title).toBe("Changes requested");
    expect(cr?.sub).toBe("Response overstates what was deleted.");
    expect(cr?.tone).toBe("warn");
  });

  it("falls back to a generic sub when the change request carries no reason", () => {
    const cr = derive([{ lastAuditAction: "Changes requested", lastAuditReason: "" }]).find(
      (n) => n.kind === "cr",
    );
    expect(cr?.sub).toBe("The approver returned this case.");
  });

  it("names the systems that need action, from either the status or the outcome", () => {
    const byStatus = derive([
      { systems: [system("pg", "Action required"), ...systems().slice(1)] },
    ]).find((n) => n.kind === "ar");
    expect(byStatus?.title).toBe("System needs action");
    expect(byStatus?.sub).toBe("Production database on Maya Lindqvist’s case.");
    expect(byStatus?.tab).toBe("checklist");

    const byOutcome = derive([
      {
        type: "Erasure",
        systems: [
          system("stripe", "Action required", { outcome: "Action required" }),
          system("pg", "Action required", { outcome: "Action required" }),
          ...systems().slice(2),
        ],
      },
    ]).find((n) => n.kind === "ar");
    expect(byOutcome?.sub).toBe("Stripe, Production database on Maya Lindqvist’s case.");
  });

  it("suppresses the action item while the case is awaiting approval", () => {
    const list = derive([
      {
        status: "Awaiting approval",
        systems: [system("pg", "Action required"), ...systems().slice(1)],
      },
    ]);
    expect(list.some((n) => n.kind === "ar")).toBe(false);
  });

  it("raises a deadline notice at five days or fewer, with the right wording", () => {
    const received = new Date(Date.UTC(2026, 8, 8)); // deadline 8 Oct → overdue 5 days at NOW
    const overdue = derive([{ receivedAt: received }]).find((n) => n.kind === "dl");
    expect(overdue?.title).toBe("Overdue by 5 days");
    expect(overdue?.sub).toBe("Access for Maya Lindqvist is due 8 Oct 2026.");

    const dueToday = derive([
      { receivedAt: new Date(Date.UTC(2026, 8, 13)) },
    ]).find((n) => n.kind === "dl");
    expect(dueToday?.title).toBe("Due today");

    const soon = derive([{ receivedAt: new Date(Date.UTC(2026, 8, 17)) }]).find(
      (n) => n.kind === "dl",
    );
    expect(soon?.title).toBe("Deadline in 4 days");

    // Exactly five days is the boundary: it notifies.
    const five = derive([{ receivedAt: new Date(Date.UTC(2026, 8, 18)) }]).find(
      (n) => n.kind === "dl",
    );
    expect(five?.title).toBe("Deadline in 5 days");

    const oneDay = derive([{ receivedAt: new Date(Date.UTC(2026, 8, 14)) }]).find(
      (n) => n.kind === "dl",
    );
    expect(oneDay?.title).toBe("Deadline in 1 day");
  });

  it("says nothing about the deadline beyond five days, or while awaiting approval", () => {
    expect(derive([{}]).some((n) => n.kind === "dl")).toBe(false); // 11 days left
    // Six days is outside the window: the boundary is exactly five.
    expect(
      derive([{ receivedAt: new Date(Date.UTC(2026, 8, 19)) }]).some((n) => n.kind === "dl"),
    ).toBe(false);
    const awaiting = derive([{ status: "Awaiting approval", receivedAt: new Date(Date.UTC(2026, 8, 13)) }]);
    expect(awaiting.some((n) => n.kind === "dl")).toBe(false);
  });

  it("never notifies about a closed case", () => {
    expect(derive([{ status: "Completed" }])).toEqual([]);
    expect(derive([{ status: "Rejected" }])).toEqual([]);
    expect(derive([{ status: "Completed", risk: "High" }], "Approver")).toEqual([]);
  });

  it("marks items read from the stored read map, keyed by caseId + kind", () => {
    const list = derive([{ status: "New" }], "Handler", { "DSAR-2026-00418nw": true });
    expect(list).toHaveLength(1);
    expect(list[0]?.unread).toBe(false);
  });

  it("can produce several notifications for one case, each with its own key", () => {
    const list = derive([
      {
        status: "New",
        receivedAt: new Date(Date.UTC(2026, 8, 13)),
        systems: [system("pg", "Action required"), ...systems().slice(1)],
      },
    ]);
    expect(list.map((n) => n.kind)).toEqual(["nw", "ar", "dl"]);
    expect(new Set(list.map((n) => n.id)).size).toBe(3);
  });

  it("carries the SLA label in the meta line, so the popover matches the list", () => {
    const meta = derive([{ status: "New" }])[0]?.meta;
    expect(meta).toBe("DSAR-2026-00418 · 11 days left");
  });
});

describe("badge helpers", () => {
  it("caps the unread badge at 9+", () => {
    expect(unreadBadge(0)).toBe("");
    expect(unreadBadge(1)).toBe("1");
    expect(unreadBadge(9)).toBe("9");
    expect(unreadBadge(10)).toBe("9+");
  });

  it("describes the bell for screen readers", () => {
    expect(bellAriaLabel(3)).toBe("Notifications, 3 unread");
  });
});
