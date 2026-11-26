/**
 * Signed links (Option 3 storage slice) against the real database. Exercises the security
 * guarantees: a link is bound to one artifact + workspace + content hash, consumes exactly
 * once (replay is denied), expires server-side, and an unknown token is indistinguishable
 * from a denied one (both come back non-ok). RLS is real: consumeSignedLink goes through
 * withLookup -> app_tenant, so the token-hash policy is what makes the row visible.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { systemDb } from "@/db/client";
import { cases, evidencePacks, orgs, signedLinks, users, workspaces } from "@/db/schema";
import { hashEmail, hashToken } from "@/server/auth/crypto";
import { issueSignedLink, consumeSignedLink } from "@/server/cases/signed-links";
import { renderEvidencePackPdf } from "@/server/cases/evidence-pdf";
import { buildEvidencePack } from "@/domain/evidence";
import { GET as getAccessRoute } from "@/app/api/evidence/access/route";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t12sl-${RUN}`;
// cases_number_format_check requires DSAR-{4-digit year}-{5 zero-padded digits}.
const caseNum = () => `DSAR-2026-${String(10000 + (Number(RUN) % 89999)).padStart(5, "0")}`;

let orgId = "";
let wsId = "";
let userId = "";
let packId = "";
let content: ReturnType<typeof buildEvidencePack>;
let actor: Actor;

const packInput = () => ({
  caseNumber: caseNum(),
  requestType: "Access",
  requesterName: "Jane Doe",
  requesterEmail: "jane@example.test",
  identifier: "jane.doe",
  details: "All my data",
  receivedAt: "13 Oct 2026, 10:42",
  statutoryDueAt: "13 Nov 2026, 10:42",
  status: "In progress",
  closedAt: null,
  extensionMonths: 0,
  emailVerification: "Confirmed",
  identifierMatch: "Match",
  identifierNote: "",
  idDocumentProvided: true,
  identityVerified: true,
  clientName: `${tag}-client`,
  systems: [{ name: "Mixpanel", owner: "Sara", status: "Action required", evidence: ["events.csv"], reason: "" }],
  audit: [{ at: "13 Oct 2026, 10:42", actor: "Sara", action: "Redaction recorded", category: "Redaction", reason: "PII removed" }],
});

beforeAll(async () => {
  orgId = (await systemDb.insert(orgs).values({ name: `${tag}-org`, kind: "direct" }).returning({ id: orgs.id }))[0]!.id;
  wsId = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!.id;
  userId = (
    await systemDb
      .insert(users)
      .values({ orgId, workspaceId: wsId, email: `${tag}-owner@example.test`, emailHash: hashEmail(`${tag}-owner@example.test`), role: "owner", mfaRequired: "false" })
      .returning({ id: users.id })
  )[0]!.id;
  actor = { userId, orgId, workspaceId: wsId, roles: ["owner"], label: `${tag}-owner`, mfaSatisfied: true };

  const caseId = (
    await systemDb
      .insert(cases)
      .values({ orgId, workspaceId: wsId, caseNumber: caseNum(), requestType: "Access", receivedAt: new Date(), statutoryDueAt: new Date(Date.now() + 30 * 86_400_000) })
      .returning({ id: cases.id })
  )[0]!.id;

  content = buildEvidencePack(packInput(), false, "13 Oct 2026, 12:00");
  packId = (
    await systemDb
      .insert(evidencePacks)
      .values({ orgId, workspaceId: wsId, caseId, version: 1, draft: false, generatedBy: userId, content })
      .returning({ id: evidencePacks.id })
  )[0]!.id;
});

describe("signed links (evidence pack)", () => {
  it("issues a link and consumes it exactly once", async () => {
    const issued = await issueSignedLink(actor, { artifactId: packId, recipientType: "requester", reason: "Shared with the requester for download" });
    expect(issued.token.length).toBeGreaterThan(32);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // The bound content hash is the sha256 of a fresh render of the same snapshot.
    expect(issued.contentHash).toBe(createHash("sha256").update(renderEvidencePackPdf(content)).digest("hex"));

    const first = await consumeSignedLink(issued.token);
    expect(first.status).toBe("ok");
    if (first.status === "ok") {
      expect(first.artifactId).toBe(packId);
      expect(first.workspaceId).toBe(wsId);
      expect(first.contentHash).toBe(issued.contentHash);
    }

    // Single-use: the second consumption is a replay - denied, not disclosed.
    const second = await consumeSignedLink(issued.token);
    expect(second.status).toBe("denied");
    if (second.status === "denied") expect(second.reason).toBe("replayed");

    // A concurrent re-use after the claim is also denied (the consumed flag is already set).
    const third = await consumeSignedLink(issued.token);
    expect(third.status).toBe("denied");
  });

  it("rejects an unknown token generically", async () => {
    expect((await consumeSignedLink("not-a-real-token-0123456789abcdef")).status).toBe("invalid");
    expect((await consumeSignedLink("")).status).toBe("invalid");
  });

  it("rejects an expired link server-side", async () => {
    const issued = await issueSignedLink(actor, { artifactId: packId, recipientType: "requester", reason: "Expiry test link" });
    // Backdate the server-side expiry (the URL is unchanged; expiry is enforced in the row).
    await systemDb.update(signedLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(signedLinks.tokenHash, hashToken(issued.token)));
    const res = await consumeSignedLink(issued.token);
    expect(res.status).toBe("denied");
    if (res.status === "denied") expect(res.reason).toBe("expired");
  });

  it("stores only the token hash at rest, never the raw token", async () => {
    const issued = await issueSignedLink(actor, { artifactId: packId, recipientType: "requester", reason: "At-rest hashing check" });
    const [row] = await systemDb
      .select({ tokenHash: signedLinks.tokenHash })
      .from(signedLinks)
      .where(eq(signedLinks.tokenHash, hashToken(issued.token)))
      .limit(1);
    expect(row).toBeTruthy();
    expect(row!.tokenHash).toBe(hashToken(issued.token));
    expect(row!.tokenHash).not.toBe(issued.token);
  });
});

describe("evidence access route (GET /api/evidence/access)", () => {
  const hit = (token: string) =>
    getAccessRoute(
      new Request(`http://localhost/api/evidence/access${token ? `?token=${encodeURIComponent(token)}` : ""}`) as never,
      {} as never,
    );

  it("streams the PDF once, then returns the generic 404 on replay", async () => {
    const issued = await issueSignedLink(actor, { artifactId: packId, recipientType: "requester", reason: "Route stream test" });
    const first = await hit(issued.token);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("application/pdf");
    expect(first.headers.get("content-disposition")).toContain("attachment");
    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(createHash("sha256").update(Buffer.from(await first.arrayBuffer())).digest("hex")).toBe(issued.contentHash);

    const replay = await hit(issued.token);
    expect(replay.status).toBe(404);
  });

  it("returns the same generic 404 body for unknown, malformed and replayed tokens", async () => {
    const unknown = await hit("not-a-real-token");
    const malformed = await hit("");
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
    const unknownBody = await unknown.text();
    expect(await malformed.text()).toBe(unknownBody);

    const issued = await issueSignedLink(actor, { artifactId: packId, recipientType: "requester", reason: "Disclosure parity test" });
    await consumeSignedLink(issued.token);
    const replayed = await hit(issued.token);
    expect(replayed.status).toBe(404);
    expect(await replayed.text()).toBe(unknownBody);
  });

  it("fails closed when the bound content hash does not match the artifact", async () => {
    const issued = await issueSignedLink(actor, { artifactId: packId, recipientType: "requester", reason: "Integrity binding test" });
    await systemDb.update(signedLinks).set({ contentHash: "deadbeef" }).where(eq(signedLinks.tokenHash, hashToken(issued.token)));
    const res = await hit(issued.token);
    expect(res.status).toBe(404);
  });
});
