/**
 * Notifications against the real database: derived from open cases, split by role, and the
 * read marks persist while the list does not.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemDb, systemPool } from "@/db/client";
import { cases, caseSystems, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/server/cases/notifications";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t07notif-${RUN}`;
let orgId = ""; let wsId = "";
let handler: Actor; let approver: Actor; let owner: Actor;
const NOW = new Date(Date.UTC(2026, 9, 13, 10, 42));

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    orgId = org.id;
    const ws = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    wsId = ws.id;

    const mkUser = async (name: string, email: string, role: "request_handler" | "approver" | "owner") =>
      (await systemDb.insert(users).values({
        orgId, workspaceId: wsId, email, emailHash: hashEmail(email), name, role,
      }).returning({ id: users.id }))[0]!.id;

    const priyaId = await mkUser("Priya Shah", `${tag}-priya@example.test`, "request_handler");
    await mkUser("Daniel Okafor", `${tag}-daniel@example.test`, "approver");
    const saraId = await mkUser("Sara Lind", `${tag}-sara@example.test`, "owner");
    handler = {
      userId: priyaId, orgId, workspaceId: wsId, roles: ["request_handler"],
      label: "Priya Shah", mfaSatisfied: true,
    };
    approver = {
      userId: priyaId, orgId, workspaceId: wsId, roles: ["approver"],
      label: "Daniel Okafor", mfaSatisfied: true,
    };
    owner = {
      userId: saraId, orgId, workspaceId: wsId, roles: ["owner"],
      label: "Sara Lind", mfaSatisfied: true,
    };

    const mkCase = async (caseNumber: string, over: {
      status?: "New" | "Verifying" | "In progress" | "Awaiting approval";
      risk?: "Low" | "Medium" | "High";
      receivedAt: Date;
    }) =>
      (await systemDb.insert(cases).values({
        orgId, workspaceId: wsId, caseNumber, requestType: "Access",
        status: over.status ?? "In progress", priority: "Normal", risk: over.risk ?? "Low",
        receivedAt: over.receivedAt, statutoryDueAt: new Date(over.receivedAt.getTime() + 30 * 86_400_000),
        requesterName: "Maya Lindqvist", requesterEmail: "maya@example.test",
      }).returning({ id: cases.id }))[0]!.id;

    await mkCase("DSAR-2026-00418", { status: "New", receivedAt: new Date(Date.UTC(2026, 8, 24)) }); // nw
    await mkCase("DSAR-2026-00412", { status: "Awaiting approval", receivedAt: new Date(Date.UTC(2026, 8, 20)) }); // ap
    await mkCase("DSAR-2026-00405", { status: "In progress", receivedAt: new Date(Date.UTC(2026, 8, 1)) }); // dl (overdue)
    await mkCase("DSAR-2026-00420", { status: "Verifying", risk: "High", receivedAt: new Date(Date.UTC(2026, 8, 24)) }); // hr
    const arCase = await mkCase("DSAR-2026-00421", { status: "In progress", receivedAt: new Date(Date.UTC(2026, 8, 19)) }); // ar

    await systemDb.insert(caseSystems).values({
      orgId, workspaceId: wsId, caseId: arCase, sourceKey: "pg", name: "Production database", status: "Action required",
    });
  } catch (e) {
    throw new Error(`notification suite setup failed: ${String(e)}`);
  }
});

afterAll(async () => { await systemPool.end().catch(() => {}); });

describe("listNotifications()", () => {
  it("gives a handler the working notifications, never the approver's", async () => {
    const feed = await listNotifications(handler, NOW);
    const kinds = feed.notifications.map((n) => n.kind).sort();
    expect(kinds).toEqual(["ar", "dl", "nw"]);
    expect(feed.unread).toBe(3);
  });

  it("gives an approver the sign-off and high-risk notifications, never the handler's", async () => {
    const feed = await listNotifications(approver, NOW);
    const kinds = feed.notifications.map((n) => n.kind).sort();
    expect(kinds).toEqual(["ap", "hr"]);
  });

  it("gives an owner BOTH lists - sign-off and working queue", async () => {
    const feed = await listNotifications(owner, NOW);
    const kinds = feed.notifications.map((n) => n.kind).sort();
    expect(kinds).toEqual(["ap", "ar", "dl", "hr", "nw"]);
  });

  it("names the system in the Action-required notification", async () => {
    const feed = await listNotifications(handler, NOW);
    const ar = feed.notifications.find((n) => n.kind === "ar");
    expect(ar?.sub).toBe("Production database on Maya Lindqvist’s case.");
  });

  it("carries the SLA label in the meta line", async () => {
    const feed = await listNotifications(handler, NOW);
    const nw = feed.notifications.find((n) => n.kind === "nw");
    expect(nw?.meta).toBe("DSAR-2026-00418 · 11 days left");
  });
});

describe("read marks", () => {
  it("marking one read flips only that one", async () => {
    await markNotificationRead(handler, "DSAR-2026-00418nw");
    const feed = await listNotifications(handler, NOW);
    const nw = feed.notifications.find((n) => n.id === "DSAR-2026-00418nw");
    expect(nw?.unread).toBe(false);
    expect(feed.unread).toBe(2);
  });

  it("marking all read clears the badge and survives re-derivation", async () => {
    await markAllNotificationsRead(handler, NOW);
    const feed = await listNotifications(handler, NOW);
    expect(feed.unread).toBe(0);
    expect(feed.notifications.every((n) => !n.unread)).toBe(true);
  });

  it("is idempotent - re-marking does not throw or duplicate", async () => {
    await markNotificationRead(handler, "DSAR-2026-00418nw");
    await markNotificationRead(handler, "DSAR-2026-00418nw");
    const feed = await listNotifications(handler, NOW);
    expect(feed.unread).toBe(0);
  });

  it("refuses to mark a key the actor is not actually seeing", async () => {
    await expect(markNotificationRead(handler, "DSAR-2026-00412ap")).rejects.toMatchObject({
      status: 422,
    });
    // A key that exists for the APPROVER is not valid for the handler.
    await expect(markNotificationRead(handler, "DSAR-2026-99999dl")).rejects.toMatchObject({
      status: 422,
    });
  });
});
