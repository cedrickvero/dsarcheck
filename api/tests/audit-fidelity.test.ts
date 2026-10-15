import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemDb, systemPool } from "@/db/client";
import { auditEvents, objects, orgs, workspaces } from "@/db/schema";
import type { Actor } from "@/server/auth/require-auth";
import type { PermissionSource } from "@/server/auth/authorize";
import { buildObjectKey } from "@/server/storage/objectKey";
import { issueDownloadUrl, issueUploadUrl } from "@/server/storage/signedUrl";

const RUN = `${Date.now()}`;
const REASON = "guardrail N-1 / N-2 regression probe";
const allow: PermissionSource = { can: () => true };

let ready = false;
let actor: Actor;

beforeAll(async () => {
  try {
    const tag = `n12-${RUN}`;
    const org = (
      await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id })
    )[0]!;
    const ws = (
      await systemDb
        .insert(workspaces)
        .values({ orgId: org.id, name: `${tag}-ws` })
        .returning({ id: workspaces.id })
    )[0]!;
    actor = {
      userId: `user-${tag}`,
      label: "N12 Actor",
      orgId: org.id,
      workspaceId: ws.id,
      roles: ["owner"],
    };
    await systemDb.select({ id: objects.id }).from(objects).limit(1);
    ready = true;
  } catch {
    ready = false;
  }
});

afterAll(async () => {
  await systemPool.end().catch(() => {});
});

describe("audit fidelity (guardrail N-1 / N-2)", () => {
  it("labels an internal authorization failure as authorization_unavailable, not a policy refusal (N-1)", async () => {
    if (!ready) return;
    const id = `req-${RUN}-n1`;
    const broken: PermissionSource = {
      can: () => {
        throw new Error("permission store unreachable");
      },
    };
    await expect(
      issueUploadUrl({
        actor,
        purpose: "evidence",
        contentType: "application/pdf",
        reason: REASON,
        requestId: id,
        permissions: broken,
      }),
    ).rejects.toBeTruthy();

    const rows = await systemDb.select({ meta: auditEvents.meta }).from(auditEvents);
    const mine = rows.filter((r) => (r.meta as { requestId?: string } | null)?.requestId === id);
    expect(mine).toHaveLength(1);
    const meta = mine[0]!.meta as { outcome?: string; denialCode?: string; deniedBy?: string };
    expect(meta.outcome).toBe("denied");
    // a failure to DECIDE must not be recorded as a decision to REFUSE on policy
    expect(meta.denialCode).toBe("authorization_unavailable");
    expect(meta.deniedBy).toBe("Error");
  });

  it("never lets a failed audit write replace the refusal it was recording (N-2)", async () => {
    if (!ready) return;
    // an actor whose workspace row does not exist: the denial INSERT fails its FK
    const ghost: Actor = {
      ...actor,
      workspaceId: "00000000-0000-4000-8000-000000000000",
      orgId: "00000000-0000-4000-8000-000000000000",
    };
    const foreign = buildObjectKey({
      workspaceId: "9a7f5b31-2c4d-4e6f-8a91-0b1c2d3e4f50",
      purpose: "evidence",
    });

    let caught: unknown;
    try {
      await issueDownloadUrl({
        actor: ghost,
        purpose: "evidence",
        objectKey: foreign,
        reason: REASON,
        requestId: `req-${RUN}-n2`,
        permissions: allow,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught, "no error surfaced at all").toBeTruthy();
    // the refusal must be what the caller sees, NOT the audit write's FK failure
    expect((caught as Error).name).toBe("InvalidObjectKeyError");
    expect(String((caught as Error).message)).toMatch(/workspace|object key/i);
  });
});
