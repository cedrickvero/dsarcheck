/**
 * The approval server read and transitions, against the real database: send-for-approval
 * is blocked until every pre-closure check passes, an approver approves-and-closes
 * (Completed + closed_at), requests changes (-> In progress) or rejects (-> Rejected), and a
 * cross-tenant case is unknown (RLS).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { auditEvents, cases, caseFiles, caseSystems, orgs, redactionTokens, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import {
  approveAndClose,
  getApproval,
  rejectCase,
  requestChanges,
  selectTemplate,
  sendForApproval,
} from "@/server/cases/approval";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t08ap-${RUN}`;

let orgId = ""; let wsId = ""; let otherWsId = "";
let handlerId = ""; let approverId = ""; let otherCaseId = "";
let handler: Actor; let approver: Actor;

const num = () => `DSAR-2026-${String(10000 + Math.floor(Math.random() * 89999)).padStart(5, "0")}`;

beforeAll(async () => {
  try {
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    orgId = org.id;
    const ws = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    wsId = ws.id;
    const otherWs = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-other-ws` }).returning({ id: workspaces.id }))[0]!;
    otherWsId = otherWs.id;

    const mkUser = async (role: "request_handler" | "approver") =>
      (await systemDb.insert(users).values({
        orgId, workspaceId: wsId, email: `${tag}-${role}@example.test`, emailHash: hashEmail(`${tag}-${role}@example.test`), role,
      }).returning({ id: users.id }))[0]!.id;
    handlerId = await mkUser("request_handler");
    approverId = await mkUser("approver");
    handler = { userId: handlerId, orgId, workspaceId: wsId, roles: ["request_handler"], label: `${tag}-request_handler@example.test`, mfaSatisfied: true };
    approver = { userId: approverId, orgId, workspaceId: wsId, roles: ["approver"], label: `${tag}-approver@example.test`, mfaSatisfied: true };

    otherCaseId = (await systemDb.insert(cases).values({
      orgId, workspaceId: otherWsId, caseNumber: num(), requestType: "Access", status: "In progress", priority: "Normal",
      receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"), identityVerified: true, template: "Access — copy",
    }).returning({ id: cases.id }))[0]!.id;
  } catch (e) {
    throw new Error(`approval suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

type Status = "New" | "Verifying" | "In progress" | "Awaiting approval" | "Completed" | "Extended" | "Rejected";
const mkCase = async (over: { status?: Status; identityVerified?: boolean; template?: string } = {}) =>
  (await systemDb.insert(cases).values({
    orgId, workspaceId: wsId, caseNumber: num(), requestType: "Access", status: over.status ?? "In progress", priority: "Normal",
    receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"),
    identityVerified: over.identityVerified ?? false, template: over.template ?? "",
  }).returning({ id: cases.id }))[0]!.id;

describe("getApproval", () => {
  it("blocks closure while identity is unverified", async () => {
    const id = await mkCase();
    const view = await getApproval(handler, id);
    expect(view!.checks.allPass).toBe(false);
    expect(view!.checks.identityVerified).toBe(false);
    expect(view!.checks.blockers.some((b) => b.id === "id")).toBe(true);
    expect(view!.responsePreview).toContain("Select a response template");
  });
});

describe("selectTemplate", () => {
  it("sets the template and writes an approval audit row", async () => {
    const id = await mkCase();
    await selectTemplate(handler, id, "Access — data copy enclosed");
    const view = await getApproval(handler, id);
    expect(view!.template).toBe("Access — data copy enclosed");
    const [ev] = await systemDb.select().from(auditEvents).where(eq(auditEvents.objectId, id));
    expect(ev!.category).toBe("Approval");
  });

  it("rejects an unknown template", async () => {
    const id = await mkCase();
    await expect(selectTemplate(handler, id, "Not a real template")).rejects.toThrow("unknown response template");
  });
});

describe("sendForApproval", () => {
  it("is blocked while a pre-closure check fails", async () => {
    const id = await mkCase(); // identity unverified
    await expect(sendForApproval(handler, id, "ready for review")).rejects.toThrow("closure is blocked");
  });

  it("succeeds once every check passes", async () => {
    const id = await mkCase({ identityVerified: true, template: "Access — copy" });
    // a completed system with evidence, so systems searched + evidence attached pass
    await systemDb.insert(caseSystems).values([
      { orgId, workspaceId: wsId, caseId: id, sourceKey: "db", name: "Production database", status: "Completed", evidenceCount: 1 },
    ]);
    const result = await sendForApproval(handler, id, "ready for review");
    expect(result.status).toBe("Awaiting approval");
  });
});

describe("closure decisions", () => {
  it("a handler cannot decide closure", async () => {
    const id = await mkCase({ status: "Awaiting approval", identityVerified: true, template: "Access — copy" });
    await expect(approveAndClose(handler, id, "looks good")).rejects.toThrow("approving closure");
  });

  it("an approver approves and closes", async () => {
    const id = await mkCase({ status: "Awaiting approval", identityVerified: true, template: "Access — copy" });
    const result = await approveAndClose(approver, id, "everything checked");
    expect(result.status).toBe("Completed");
    const [row] = await systemDb.select({ closedAt: cases.closedAt }).from(cases).where(eq(cases.id, id));
    expect(row!.closedAt).not.toBeNull();
  });

  it("an approver requests changes (back to In progress)", async () => {
    const id = await mkCase({ status: "Awaiting approval", identityVerified: true, template: "Access — copy" });
    const result = await requestChanges(approver, id, "redact the third-party email first");
    expect(result.status).toBe("In progress");
  });

  it("an approver rejects and closes, using the Refusal template", async () => {
    const id = await mkCase({ status: "Awaiting approval", identityVerified: true, template: "Access — copy" });
    const result = await rejectCase(approver, id, "out of scope");
    expect(result.status).toBe("Rejected");
    const [row] = await systemDb.select({ closedAt: cases.closedAt, template: cases.template }).from(cases).where(eq(cases.id, id));
    expect(row!.closedAt).not.toBeNull();
    expect(row!.template).toBe("Refusal — documented reason");
  });

  it("re-verifies the checklist on approve (a drifted checklist blocks closure)", async () => {
    const id = await mkCase({ status: "Awaiting approval", identityVerified: true, template: "Access — copy" });
    // drift: an open system appears after send-for-approval
    await systemDb.insert(caseSystems).values([
      { orgId, workspaceId: wsId, caseId: id, sourceKey: "db", name: "Production database", status: "Not started", evidenceCount: 0 },
    ]);
    await expect(approveAndClose(approver, id, "looks fine")).rejects.toThrow("closure is blocked");
  });

  it("requires a reason", async () => {
    const id = await mkCase({ status: "Awaiting approval", identityVerified: true, template: "Access — copy" });
    await expect(approveAndClose(approver, id, "  ")).rejects.toThrow("a reason is required");
  });
});

describe("erasure closure gate (outcome drives the check)", () => {
  const mkErasure = async () =>
    (await systemDb.insert(cases).values({
      orgId, workspaceId: wsId, caseNumber: num(), requestType: "Erasure", status: "In progress", priority: "Normal",
      receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"),
      identityVerified: true, template: "Erasure — confirmation of outcomes",
    }).returning({ id: cases.id }))[0]!.id;

  it("an 'Action required' outcome blocks closure even when the checklist status says Completed", async () => {
    const id = await mkErasure();
    await systemDb.insert(caseSystems).values([
      { orgId, workspaceId: wsId, caseId: id, sourceKey: "db", name: "Production database", status: "Completed", evidenceCount: 1, outcome: "action_required", reason: "blocked" },
    ]);
    const view = await getApproval(handler, id);
    expect(view!.checks.allPass).toBe(false);
    expect(view!.checks.blockers.some((b) => b.id === "er")).toBe(true);
  });

  it("a system with no recorded outcome blocks closure", async () => {
    const id = await mkErasure();
    await systemDb.insert(caseSystems).values([
      { orgId, workspaceId: wsId, caseId: id, sourceKey: "db", name: "Production database", status: "Completed", evidenceCount: 1, outcome: null },
    ]);
    const view = await getApproval(handler, id);
    expect(view!.checks.allPass).toBe(false);
    expect(view!.checks.blockers.some((b) => b.id === "er")).toBe(true);
  });
});

describe("redaction check", () => {
  it("an Access case with an unredacted flagged token blocks the redaction check", async () => {
    const id = await mkCase({ identityVerified: true, template: "Access — copy" });
    await systemDb.insert(caseSystems).values([
      { orgId, workspaceId: wsId, caseId: id, sourceKey: "db", name: "Production database", status: "Completed", evidenceCount: 1 },
    ]);
    const fileId = (await systemDb.insert(caseFiles).values({
      orgId, workspaceId: wsId, caseId: id, sourceKey: "Zendesk", name: "ticket.pdf", type: "PDF", needsRedaction: true,
    }).returning({ id: caseFiles.id }))[0]!.id;
    await systemDb.insert(redactionTokens).values([
      { orgId, workspaceId: wsId, caseId: id, fileId, category: "Email", snippet: "a@b…", flagged: true, redacted: false },
    ]);
    const view = await getApproval(handler, id);
    expect(view!.checks.allPass).toBe(false);
    expect(view!.checks.blockers.some((b) => b.id === "red")).toBe(true);
  });
});

describe("tenant isolation", () => {
  it("treats a cross-tenant case as unknown", async () => {
    expect(await getApproval(handler, otherCaseId)).toBeNull();
    await expect(sendForApproval(handler, otherCaseId, "nope")).rejects.toThrow("unknown case");
  });
});
