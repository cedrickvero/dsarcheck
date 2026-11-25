/**
 * Evidence pack, against the real database: generation creates a draft version with an
 * audit row and a nine-section snapshot; approval auto-creates a FINAL version; and a
 * cross-tenant case is unknown (RLS).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { auditEvents, caseSystems, cases, evidencePacks, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { generateEvidencePack, getEvidencePack } from "@/server/cases/evidence";
import { approveAndClose, sendForApproval } from "@/server/cases/approval";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t10ev-${RUN}`;

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
      receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"),
    }).returning({ id: cases.id }))[0]!.id;
  } catch (e) {
    throw new Error(`evidence suite setup failed - must not pass silently: ${String(e)}`);
  }
});
afterAll(async () => { await systemPool.end().catch(() => {}); });

const mkApprovedCase = async () => {
  const id = (await systemDb.insert(cases).values({
    orgId, workspaceId: wsId, caseNumber: num(), requestType: "Access", status: "In progress", priority: "Normal",
    receivedAt: new Date("2026-09-24T00:00:00Z"), statutoryDueAt: new Date("2026-10-24T00:00:00Z"),
    identityVerified: true, template: "Access — copy",
  }).returning({ id: cases.id }))[0]!.id;
  await systemDb.insert(caseSystems).values([
    { orgId, workspaceId: wsId, caseId: id, sourceKey: "db", name: "Production database", status: "Completed", evidenceCount: 1 },
  ]);
  return id;
};

describe("generateEvidencePack", () => {
  it("creates a draft version with a nine-section snapshot and an audit row", async () => {
    const id = await mkApprovedCase();
    const result = await generateEvidencePack(handler, id);
    expect(result.version).toBe(1);
    expect(result.draft).toBe(true);

    const [pack] = await systemDb.select({ draft: evidencePacks.draft, content: evidencePacks.content }).from(evidencePacks).where(eq(evidencePacks.caseId, id));
    expect(pack!.draft).toBe(true);
    expect((pack!.content as { sections: unknown[] }).sections).toHaveLength(9);

    const [ev] = await systemDb.select().from(auditEvents).where(eq(auditEvents.objectId, id));
    expect(ev!.category).toBe("Evidence");
    expect(ev!.action).toContain("Evidence pack v1 generated");

    const view = await getEvidencePack(handler, id);
    expect(view!.versions).toHaveLength(1);
    expect(view!.latest).not.toBeNull();
  });

  it("increments the version on regenerate", async () => {
    const id = await mkApprovedCase();
    await generateEvidencePack(handler, id);
    const second = await generateEvidencePack(handler, id);
    expect(second.version).toBe(2);
  });
});

describe("approval auto-final", () => {
  it("approve-and-close creates a FINAL evidence-pack version", async () => {
    const id = await mkApprovedCase();
    await sendForApproval(handler, id, "ready");
    await approveAndClose(approver, id, "everything checked");

    const [pack] = await systemDb
      .select({ draft: evidencePacks.draft, version: evidencePacks.version })
      .from(evidencePacks)
      .where(eq(evidencePacks.caseId, id));
    expect(pack).toBeDefined();
    expect(pack!.draft).toBe(false);
  });
});

describe("tenant isolation", () => {
  it("treats a cross-tenant case as unknown", async () => {
    expect(await getEvidencePack(handler, otherCaseId)).toBeNull();
    await expect(generateEvidencePack(handler, otherCaseId)).rejects.toThrow("unknown case");
  });
});
