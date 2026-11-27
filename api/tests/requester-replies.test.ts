/**
 * G18 — requester replies: sending a message and answering the info request both write the
 * right row + audit event, clear/keep `infoRequested`, and surface a "Requester replied"
 * Handler notification.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { systemDb } from "@/db/client";
import { auditEvents, caseFiles, cases, communications, orgs, workspaces } from "@/db/schema";
import type { ResolvedPortal } from "@/server/portal/resolve";
import {
  getRequesterInfoOption,
  listRequesterCommunications,
  sendRequesterMessage,
  submitRequesterInfo,
} from "@/server/portal/replies";
import { deriveNotifications } from "@/domain/notifications";

const RUN = `${Date.now()}`;
const tag = `replies${RUN}`;

let orgId = "";
let wsId = "";
let portal: ResolvedPortal;

const caseNumber = (n: number) => `DSAR-2026-${String(40000 + n).padStart(5, "0")}`;

async function makeCase(n: number, email: string, infoRequested = false) {
  const [row] = await systemDb
    .insert(cases)
    .values({
      orgId,
      workspaceId: wsId,
      caseNumber: caseNumber(n),
      requestType: "Access",
      status: infoRequested ? "Verifying" : "New",
      infoRequested,
      receivedAt: new Date(),
      statutoryDueAt: new Date(Date.now() + 30 * 86_400_000),
      requesterName: "Ada Lovelace",
      requesterEmail: email,
      identifier: "C-1",
      details: "data please",
    })
    .returning({ id: cases.id });
  return row!.id;
}

beforeAll(async () => {
  orgId = (await systemDb.insert(orgs).values({ name: `${tag}-org`, kind: "direct" }).returning({ id: orgs.id }))[0]!.id;
  wsId = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws`, subdomain: tag }).returning({ id: workspaces.id }))[0]!.id;
  portal = { orgId, workspaceId: wsId, name: `${tag}-ws`, subdomain: tag };
});

describe("sendRequesterMessage", () => {
  it("records an Inbound/Portal communication and a 'Requester replied' audit", async () => {
    const email = `msg-${RUN}@example.com`;
    const caseId = await makeCase(1, email);
    await sendRequesterMessage(portal, caseId, "Ada Lovelace", "Can you confirm receipt?");

    const [comm] = await systemDb.select().from(communications).where(eq(communications.caseId, caseId));
    expect(comm).toBeTruthy();
    expect(comm!.direction).toBe("Inbound");
    expect(comm!.channel).toBe("Portal");
    expect(comm!.body).toBe("Can you confirm receipt?");
    expect(comm!.workspaceId).toBe(wsId);

    const [audit] = await systemDb
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.objectId, caseId), eq(auditEvents.action, "Requester replied")));
    expect(audit!.actorLabel).toBe("Ada Lovelace (requester)");
    expect(audit!.category).toBe("Communications");
  });

  it("rejects an empty message", async () => {
    const email = `empty-${RUN}@example.com`;
    const caseId = await makeCase(2, email);
    await expect(sendRequesterMessage(portal, caseId, "Ada Lovelace", "   ")).rejects.toThrow();
  });
});

describe("submitRequesterInfo", () => {
  it("stores the upload, clears infoRequested, and audits 'Requester uploaded'", async () => {
    const email = `info-${RUN}@example.com`;
    const caseId = await makeCase(3, email, true);
    const bytes = new TextEncoder().encode("proof of address");

    const { fileId } = await submitRequesterInfo(
      portal,
      caseId,
      "Ada Lovelace",
      { file: { name: "proof.pdf", type: "application/pdf", size: bytes.length, bytes }, note: "under my married name" },
      async () => {},
    );

    expect(fileId).toBeTruthy();
    const [file] = await systemDb.select().from(caseFiles).where(eq(caseFiles.id, fileId!));
    expect(file!.sourceKey).toBe("requester_upload");
    expect(file!.workspaceId).toBe(wsId);
    expect(file!.caseId).toBe(caseId);
    expect(file!.sha256).toHaveLength(64);

    const [c] = await systemDb.select({ infoRequested: cases.infoRequested }).from(cases).where(eq(cases.id, caseId));
    expect(c!.infoRequested).toBe(false);

    const [audit] = await systemDb
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.objectId, caseId), eq(auditEvents.action, "Requester uploaded")));
    expect(audit!.actorLabel).toBe("Ada Lovelace (requester)");
  });

  it("rejects when neither a file nor a note is provided", async () => {
    const email = `noop-${RUN}@example.com`;
    const caseId = await makeCase(4, email, true);
    await expect(submitRequesterInfo(portal, caseId, "Ada Lovelace", {})).rejects.toThrow();
  });
});

describe("listRequesterCommunications + getRequesterInfoOption", () => {
  it("returns the case's message thread", async () => {
    const email = `list-${RUN}@example.com`;
    const caseId = await makeCase(5, email);
    await sendRequesterMessage(portal, caseId, "Ada Lovelace", "Hello there");
    await systemDb.insert(communications).values({
      orgId,
      workspaceId: wsId,
      caseId,
      direction: "Outbound",
      channel: "Email",
      subject: "Your request",
      body: "We received your request.",
    });
    const messages = await systemDb.transaction(async (tx) => listRequesterCommunications(tx, caseId));
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.direction).sort()).toEqual(["Inbound", "Outbound"]);
  });

  it("returns null when no info was requested", async () => {
    const email = `noinfo-${RUN}@example.com`;
    const caseId = await makeCase(6, email);
    expect(await systemDb.transaction(async (tx) => getRequesterInfoOption(tx, caseId))).toBeNull();
  });
});

describe("Requester replied notification", () => {
  it("derives a 'Requester replied' Handler notification from a requester audit action", () => {
    const feed = deriveNotifications({
      role: "Handler",
      cases: [
        {
          id: "DSAR-2026-40001",
          type: "Access",
          status: "In progress",
          risk: "Low",
          name: "Ada Lovelace",
          receivedAt: new Date(),
          extensionMonths: 0,
          closedAt: null,
          systems: [],
          lastAuditAction: "Requester replied",
        },
      ],
      now: new Date(),
      sourceNames: {},
    });
    const rr = feed.find((n) => n.kind === "rr");
    expect(rr).toBeTruthy();
    expect(rr!.title).toBe("Requester replied");
    expect(rr!.unread).toBe(true);
  });
});
