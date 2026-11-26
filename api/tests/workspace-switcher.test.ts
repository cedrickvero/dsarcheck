/**
 * The active-workspace switcher (docs/03 § A.2): per-workspace role derivation, reachable
 * workspace enumeration, and the session-rotating switch. The session resolve now reads the
 * user by actor id (not the workspace GUC), so a session can switch tenant and still resolve;
 * the role is the membership's role in the active workspace, falling back to the home role.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { systemDb, withTenant } from "@/db/client";
import { auditEvents, memberships, orgs, users, workspaces } from "@/db/schema";
import { hashEmail, hashToken } from "@/server/auth/crypto";
import { createSession } from "@/server/auth/session-store";
import { requireAuthFromToken, type Actor } from "@/server/auth/require-auth";
import { listReachableWorkspaces, switchWorkspace } from "@/server/cases/workspaces";
import { ForbiddenError, UnauthenticatedError } from "@/server/http/errors";

const RUN = `${Date.now()}`;
const tag = `t15ws-${RUN}`;

let orgId = "";
let homeWsId = "";
let clientWsId = "";
let foreignWsId = "";
let ownerId = "";
let owner: Actor;
let oldToken = "";
let oldSessionId = "";

beforeAll(async () => {
  orgId = (await systemDb.insert(orgs).values({ name: `${tag}-org`, kind: "agency" }).returning({ id: orgs.id }))[0]!.id;
  homeWsId = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-home` }).returning({ id: workspaces.id }))[0]!.id;
  clientWsId = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-client` }).returning({ id: workspaces.id }))[0]!.id;
  foreignWsId = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-foreign` }).returning({ id: workspaces.id }))[0]!.id;
  ownerId = (
    await systemDb
      .insert(users)
      .values({ orgId, workspaceId: homeWsId, email: `${tag}@example.test`, emailHash: hashEmail(`${tag}@example.test`), role: "owner", mfaRequired: "false" })
      .returning({ id: users.id })
  )[0]!.id;

  // Membership in the client workspace with a DIFFERENT role to prove the role is per-workspace.
  await systemDb.insert(memberships).values({ orgId, userId: ownerId, workspaceId: clientWsId, workspaceName: `${tag}-client`, role: "approver", active: true });

  // A session in the home workspace, already MFA-satisfied (to prove the carry-over).
  const created = await withTenant({ orgId, workspaceId: homeWsId, actorId: ownerId }, (tx) =>
    createSession(tx, { userId: ownerId, orgId, workspaceId: homeWsId, mfaSatisfiedAt: new Date() }),
  );
  oldToken = created.token;
  oldSessionId = created.sessionId;

  owner = { userId: ownerId, orgId, workspaceId: homeWsId, roles: ["owner"], label: `${tag}@example.test`, sessionId: oldSessionId, mfaSatisfied: true };
});

describe("listReachableWorkspaces", () => {
  it("returns the home workspace plus active memberships, with per-workspace roles and names", async () => {
    const ctx = await listReachableWorkspaces(owner);
    expect(ctx.orgKind).toBe("agency");
    expect(ctx.workspaces.map((w) => w.workspaceId).sort()).toEqual([homeWsId, clientWsId].sort());

    const home = ctx.workspaces.find((w) => w.workspaceId === homeWsId)!;
    expect(home.name).toBe(`${tag}-home`);
    expect(home.role).toBe("owner");
    expect(home.isCurrent).toBe(true);

    const client = ctx.workspaces.find((w) => w.workspaceId === clientWsId)!;
    expect(client.name).toBe(`${tag}-client`);
    expect(client.role).toBe("approver");
    expect(client.isCurrent).toBe(false);
  });

  it("does not list a workspace the user has no membership in", async () => {
    const ctx = await listReachableWorkspaces(owner);
    expect(ctx.workspaces.some((w) => w.workspaceId === foreignWsId)).toBe(false);
  });
});

describe("switchWorkspace", () => {
  it("rotates the session into the target workspace, carrying MFA and auditing there", async () => {
    const { token: newToken } = await switchWorkspace(owner, clientWsId);

    // The old session is revoked: its token no longer resolves.
    await expect(requireAuthFromToken(oldToken)).rejects.toThrow(UnauthenticatedError);

    // The new token resolves with the TARGET workspace and the membership role.
    const actor = await requireAuthFromToken(newToken);
    expect(actor.workspaceId).toBe(clientWsId);
    expect(actor.roles).toEqual(["approver"]);
    expect(actor.mfaSatisfied).toBe(true);

    // The audit event is written in the target workspace.
    const [evt] = await systemDb
      .select({ action: auditEvents.action, reason: auditEvents.reason })
      .from(auditEvents)
      .where(eq(auditEvents.workspaceId, clientWsId))
      .limit(1);
    expect(evt?.action).toBe("Active workspace changed");
    expect(evt?.reason).toContain(tag);
  });

  it("refuses a workspace the user has no membership in (fail closed)", async () => {
    await expect(switchWorkspace(owner, foreignWsId)).rejects.toThrow(ForbiddenError);
  });

  it("refuses a workspace from another org (cross-tenant fail closed)", async () => {
    const otherOrgId = (await systemDb.insert(orgs).values({ name: `${tag}-other`, kind: "agency" }).returning({ id: orgs.id }))[0]!.id;
    const otherWsId = (await systemDb.insert(workspaces).values({ orgId: otherOrgId, name: `${tag}-otherws` }).returning({ id: workspaces.id }))[0]!.id;
    await expect(switchWorkspace(owner, otherWsId)).rejects.toThrow(ForbiddenError);
  });

  it("switching back to the home workspace restores the home role", async () => {
    // First switch home -> client, then client -> home, and confirm the role flips back.
    const { token: clientToken } = await switchWorkspace(owner, clientWsId);
    const clientActor = await requireAuthFromToken(clientToken);
    expect(clientActor.roles).toEqual(["approver"]);

    const { token: homeToken } = await switchWorkspace({ ...clientActor }, homeWsId);
    const homeActor = await requireAuthFromToken(homeToken);
    expect(homeActor.workspaceId).toBe(homeWsId);
    expect(homeActor.roles).toEqual(["owner"]);
  });
});

describe("requireAuthFromToken role derivation", () => {
  it("falls back to the home role when the active workspace has no membership row", async () => {
    // A fresh, unrevoked home-workspace session (no membership row for home) resolves with users.role.
    const created = await withTenant({ orgId, workspaceId: homeWsId, actorId: ownerId }, (tx) =>
      createSession(tx, { userId: ownerId, orgId, workspaceId: homeWsId, mfaSatisfiedAt: new Date() }),
    );
    const actor = await requireAuthFromToken(created.token);
    expect(actor.workspaceId).toBe(homeWsId);
    expect(actor.roles).toEqual(["owner"]);
  });
});

// hashToken is imported to satisfy the "lookup by hash" parity; assert it is consistent.
it("hashToken is stable for a given token", () => {
  expect(hashToken("x")).toBe(hashToken("x"));
  expect(hashToken("x")).not.toBe(hashToken("y"));
});
