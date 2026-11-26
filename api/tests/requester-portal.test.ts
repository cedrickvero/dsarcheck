/**
 * Requester portal (docs/03 § H2 + G2): sign-in link+code, workspace+email sessions, the
 * "your requests" list, and the email-confirmation flow.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { systemDb, withLookup, withTenant } from "@/db/client";
import { auditEvents, cases, orgs, requesterTokens, workspaces } from "@/db/schema";
import { hashToken } from "@/server/auth/crypto";
import { createCase } from "@/server/cases/create";
import {
  confirmRequesterEmail,
  createRequesterSession,
  hasRequesterCases,
  issueSignInCredential,
  listRequesterRequests,
  redeemSignInCode,
  redeemSignInLink,
  requestSignInCredential,
  resolveRequesterSession,
} from "@/server/portal/requester";
import { submitIntake } from "@/server/portal/intake";

const RUN = `${Date.now()}`;
const tag = `req${RUN}`;
const EMAIL = `requester-${RUN}@example.com`;

let orgId = "";
let wsId = "";
let portal: { orgId: string; workspaceId: string; name: string; subdomain: string };

beforeAll(async () => {
  orgId = (await systemDb.insert(orgs).values({ name: `${tag}-org`, kind: "direct" }).returning({ id: orgs.id }))[0]!.id;
  wsId = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws`, subdomain: tag }).returning({ id: workspaces.id }))[0]!.id;
  portal = { orgId, workspaceId: wsId, name: `${tag}-ws`, subdomain: tag };

  await withTenant({ orgId, workspaceId: wsId, actorId: "system" }, (tx) =>
    createCase(tx, {
      orgId,
      workspaceId: wsId,
      actorId: "system",
      actorLabel: "System",
      requestType: "Access",
      receivedAt: new Date(),
      statutoryDueAt: new Date(Date.now() + 30 * 86_400_000),
      requesterName: "Ada",
      requesterEmail: EMAIL,
      identifier: "Customer ID C-1",
      details: "please",
    }),
  );
});

describe("requester sign-in", () => {
  it("hasRequesterCases matches the email case-insensitively", async () => {
    const found = await withTenant({ orgId, workspaceId: wsId, actorId: "requester" }, (tx) =>
      hasRequesterCases(tx, EMAIL.toUpperCase()),
    );
    expect(found).toBe(true);
  });

  it("issues and redeems the sign-in link exactly once", async () => {
    const cred = await withTenant({ orgId, workspaceId: wsId, actorId: "requester" }, (tx) =>
      issueSignInCredential(tx, portal, EMAIL, "http://example.test"),
    );
    expect(cred.url).toContain("/api/track/callback?token=");
    expect(cred.code).toMatch(/^\d{6}$/);

    const redeemed = await withLookup({ requesterTokenHash: hashToken(cred.token) }, (tx) =>
      redeemSignInLink(tx, cred.token),
    );
    expect(redeemed).toMatchObject({ orgId, workspaceId: wsId, email: EMAIL });

    const replay = await withLookup({ requesterTokenHash: hashToken(cred.token) }, (tx) =>
      redeemSignInLink(tx, cred.token),
    );
    expect(replay).toBeNull();
  });

  it("redeems the 6-digit code scoped to the workspace", async () => {
    const cred = await withTenant({ orgId, workspaceId: wsId, actorId: "requester" }, (tx) =>
      issueSignInCredential(tx, portal, EMAIL, "http://example.test"),
    );
    const redeemed = await withTenant({ orgId, workspaceId: wsId, actorId: "requester" }, (tx) =>
      redeemSignInCode(tx, cred.code),
    );
    expect(redeemed).toMatchObject({ email: EMAIL });
  });

  it("issues no credential and no row for an unknown email (no enumeration)", async () => {
    const unknown = `unknown-${RUN}@example.com`;
    const issued = await withTenant({ orgId, workspaceId: wsId, actorId: "requester" }, (tx) =>
      requestSignInCredential(tx, portal, unknown, "http://example.test"),
    );
    expect(issued).toBeNull();
    const rows = await systemDb
      .select({ id: requesterTokens.id })
      .from(requesterTokens)
      .where(eq(requesterTokens.email, unknown.toLowerCase()));
    expect(rows).toHaveLength(0);
  });

  it("redeems the 6-digit code only once", async () => {
    const cred = await withTenant({ orgId, workspaceId: wsId, actorId: "requester" }, (tx) =>
      issueSignInCredential(tx, portal, EMAIL, "http://example.test"),
    );
    const first = await withTenant({ orgId, workspaceId: wsId, actorId: "requester" }, (tx) =>
      redeemSignInCode(tx, cred.code),
    );
    expect(first).toMatchObject({ email: EMAIL });
    const replay = await withTenant({ orgId, workspaceId: wsId, actorId: "requester" }, (tx) =>
      redeemSignInCode(tx, cred.code),
    );
    expect(replay).toBeNull();
  });

  it("rejects an expired code", async () => {
    const cred = await withTenant({ orgId, workspaceId: wsId, actorId: "requester" }, (tx) =>
      issueSignInCredential(tx, portal, EMAIL, "http://example.test"),
    );
    await systemDb
      .update(requesterTokens)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(requesterTokens.tokenHash, hashToken(cred.token)));
    const redeemed = await withTenant({ orgId, workspaceId: wsId, actorId: "requester" }, (tx) =>
      redeemSignInCode(tx, cred.code),
    );
    expect(redeemed).toBeNull();
  });

  it("creates and resolves a session and lists only the requester's own cases", async () => {
    const { token } = await withTenant({ orgId, workspaceId: wsId, actorId: "requester" }, (tx) =>
      createRequesterSession(tx, portal, EMAIL),
    );
    const session = await withLookup({ requesterSessionTokenHash: hashToken(token) }, (tx) =>
      resolveRequesterSession(tx, token),
    );
    expect(session).toMatchObject({ orgId, workspaceId: wsId, email: EMAIL });

    const mine = await withTenant({ orgId, workspaceId: wsId, actorId: "requester" }, (tx) =>
      listRequesterRequests(tx, EMAIL),
    );
    expect(mine.length).toBeGreaterThanOrEqual(1);

    const other = await withTenant({ orgId, workspaceId: wsId, actorId: "requester" }, (tx) =>
      listRequesterRequests(tx, `someone-else-${RUN}@example.com`),
    );
    expect(other).toHaveLength(0);
  });
});

describe("email confirmation (G2)", () => {
  it("confirms the email once, marks the case, and logs the audit", async () => {
    const result = await submitIntake(
      portal,
      { type: "Access", name: "Ada", email: EMAIL, identKind: "Customer ID", ident: "C-2", details: "data", consent: "on", human: "on" },
      "http://example.test",
    );

    const token = result.confirmUrl.split("/").pop()!;
    const confirmed = await confirmRequesterEmail(token);
    expect(confirmed).toMatchObject({ caseNumber: result.caseNumber, email: EMAIL });

    const [row] = await systemDb
      .select({ ev: cases.emailVerification })
      .from(cases)
      .where(and(eq(cases.caseNumber, result.caseNumber), eq(cases.workspaceId, wsId)));
    expect(row!.ev).toBe("Confirmed");

    const audit = await systemDb
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, "Email address confirmed"), eq(auditEvents.workspaceId, wsId)));
    expect(audit.length).toBeGreaterThanOrEqual(1);

    // single use: a replayed confirmation link confirms nothing again
    const replay = await confirmRequesterEmail(token);
    expect(replay).toBeNull();
  });
});
