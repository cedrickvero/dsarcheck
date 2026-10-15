import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { auditEvents, objects, orgs, workspaces } from "@/db/schema";
import type { Actor } from "@/server/auth/require-auth";
import type { PermissionSource } from "@/server/auth/authorize";
import { buildObjectKey } from "@/server/storage/objectKey";
import { putObjectCommand, serverSideEncryption } from "@/server/storage/s3Client";
import { env } from "@/env";
import { issueDownloadUrl, issueUploadUrl, recordFileAccess } from "@/server/storage/signedUrl";

/**
 * R2 behavioural tests. These need the objects table (migration 0004) and the
 * application DSN, so they skip cleanly before the migration is applied.
 */
const hasEnv = Boolean(process.env.DATABASE_URL && process.env.APP_DATABASE_URL);

const allow: PermissionSource = { can: () => true };
const deny: PermissionSource = { can: () => false };

let orgId = "";
let actor: Actor;
const REASON = "Requested by the data subject during case handling";
/** Audit rows persist (append-only), so ids must be unique per run or a rerun
 *  reads its own previous run as a duplicate. */
const RUN = `${Date.now()}`;
const RID = {
  upload: `req-${RUN}-upload`,
  persist: `req-${RUN}-persist`,
  clamp: `req-${RUN}-clamp`,
  sse: `req-${RUN}-sse`,
  denied: `req-${RUN}-denied`,
  atomic: `req-${RUN}-atomic`,
  cross: `req-${RUN}-cross`,
  mismatch: `req-${RUN}-mismatch`,
  purpose: `req-${RUN}-purpose`,
  download: `req-${RUN}-download`,
  access: `req-${RUN}-access`,
};

async function objectsExist(): Promise<boolean> {
  try {
    await systemDb.select({ id: objects.id }).from(objects).limit(1);
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasEnv)("signed URL contract", () => {
  let ready = false;

  beforeAll(async () => {
    ready = await objectsExist();
    if (!ready) return;
    const org = (
      await systemDb
        .insert(orgs)
        .values({ name: `R2 Org ${Date.now()}` })
        .returning({ id: orgs.id })
    )[0]!;
    const ws = (
      await systemDb
        .insert(workspaces)
        .values({ orgId: org.id, name: `R2 WS ${Date.now()}` })
        .returning({ id: workspaces.id })
    )[0]!;
    orgId = org.id;
    actor = {
      userId: `r2-user-${Date.now()}`,
      label: "R2 Tester",
      orgId: org.id,
      workspaceId: ws.id,
      roles: ["owner"],
    };
  });

  afterAll(async () => {
    await systemPool.end().catch(() => {});
  });

  const itReady = (fn: () => Promise<void>) =>
    it("__", async () => {
      if (!ready) return;
      await fn();
    });

  it("issues an upload URL scoped to the actor's own workspace", async () => {
    if (!ready) return;
    const issued = await issueUploadUrl({
      actor,
      purpose: "evidence",
      contentType: "application/pdf",
      reason: REASON,
      requestId: RID.upload,
      permissions: allow,
    });
    expect(issued.method).toBe("PUT");
    expect(issued.operation).toBe("upload");
    expect(issued.objectKey.startsWith(`ws/${actor.workspaceId}/`)).toBe(true);
    expect(issued.url).toContain(issued.objectKey);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("persists metadata AND the audit event, with all eight required fields", async () => {
    if (!ready) return;
    const issued = await issueUploadUrl({
      actor,
      purpose: "evidence",
      contentType: "text/plain",
      reason: REASON,
      requestId: RID.persist,
      permissions: allow,
    });

    const rows = await systemDb.select().from(objects).where(eq(objects.objectKey, issued.objectKey));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.workspaceId).toBe(actor.workspaceId);
    expect(rows[0]!.orgId).toBe(actor.orgId);
    expect(rows[0]!.purpose).toBe("evidence");
    expect(rows[0]!.contentType).toBe("text/plain");
    expect(rows[0]!.uploaderActorId).toBe(actor.userId);

    const audits = await systemDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "file.upload_url.issued"));
    const matching = audits.filter(
      (a) => (a.meta as Record<string, unknown>)?.requestId === RID.persist,
    );
    expect(matching).toHaveLength(1);
    const meta = matching[0]!.meta as Record<string, unknown>;
    for (const field of ["requestId", "objectKey", "purpose", "operation", "method", "expiresAt"]) {
      expect(meta[field], `audit meta is missing ${field}`).toBeTruthy();
    }
    expect(meta.actorId ?? matching[0]!.actorId).toBe(actor.userId);
    expect(matching[0]!.workspaceId).toBe(actor.workspaceId);

    // the applied encryption is on the record, and no key material is
    const sse = meta.sse as { algorithm?: string; keyIdRef?: unknown } | null;
    expect(sse?.algorithm).toBe("AES256");
    expect(sse?.keyIdRef).toBeNull();
    const serialised = JSON.stringify(matching[0]!.meta);
    expect(serialised).not.toContain(env.S3_SECRET_KEY);
    expect(serialised).not.toContain(env.S3_ACCESS_KEY);
  });

  it("clamps an absurd requested TTL to the ceiling", async () => {
    if (!ready) return;
    const issued = await issueUploadUrl({
      actor,
      purpose: "evidence",
      contentType: "application/pdf",
      reason: REASON,
      requestId: RID.clamp,
      requestedTtlSeconds: 86_400,
      permissions: allow,
    });
    expect(issued.ttlSeconds).toBe(900);
    expect(issued.url).toMatch(/X-Amz-Expires=900/);
  });

  it("signs the SSE header into the upload URL", async () => {
    if (!ready) return;
    expect(serverSideEncryption()).toEqual({ ServerSideEncryption: "AES256" });
    const issued = await issueUploadUrl({
      actor,
      purpose: "evidence",
      contentType: "application/pdf",
      reason: REASON,
      requestId: RID.sse,
      permissions: allow,
    });
    expect(decodeURIComponent(issued.url)).toContain("x-amz-server-side-encryption");
  });

  it("takes no caller-supplied encryption settings, and cannot be overridden by them", async () => {
    if (!ready) return;
    // Arity is the point: the builder accepts a key and a content type, so there is
    // no parameter through which a caller could choose or weaken the encryption.
    expect(putObjectCommand.length).toBe(2);

    const key = buildObjectKey({ workspaceId: actor.workspaceId, purpose: "evidence" });
    const cmd = putObjectCommand(key, "application/pdf");
    expect(cmd.input.ServerSideEncryption).toBe("AES256");
    // in kms mode the key would come from config, never from the caller
    expect(cmd.input.SSEKMSKeyId).toBeUndefined();

    // and because the SSE header is signed, substituting a value breaks the signature
    const issued = await issueUploadUrl({
      actor,
      purpose: "evidence",
      contentType: "application/pdf",
      reason: REASON,
      requestId: RID.sse,
      permissions: allow,
    });
    expect(decodeURIComponent(issued.url)).toMatch(
      /X-Amz-SignedHeaders=[^&]*x-amz-server-side-encryption/,
    );
  });

  it("refuses an authorization denial: no URL, no row, and the denial is audited", async () => {
    if (!ready) return;
    const before = await systemDb.select().from(objects);
    await expect(
      issueUploadUrl({
        actor,
        purpose: "evidence",
        contentType: "application/pdf",
        reason: REASON,
        requestId: RID.denied,
        permissions: deny,
      }),
    ).rejects.toThrow(/authorization denied/);

    const after = await systemDb.select().from(objects);
    expect(after.length).toBe(before.length);

    const audits = await systemDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "file.upload_url.issued"));
    const denials = audits.filter(
      (a) =>
        (a.meta as Record<string, unknown>)?.outcome === "denied" &&
        (a.meta as Record<string, unknown>)?.requestId === RID.denied,
    );
    expect(denials).toHaveLength(1);
    expect((denials[0]!.meta as Record<string, unknown>).requestId).toBe(RID.denied);
  });

  it("rolls the metadata back when the audit write fails INSIDE the transaction (atomicity)", async () => {
    if (!ready) return;
    const before = (await systemDb.select().from(objects)).length;

    // The objects row is written FIRST and the audit event second. A blank actor
    // label violates audit_events' attribution CHECK, so the audit insert fails
    // inside the transaction - if the two writes were not atomic, the objects row
    // would survive a failure that happened after it.
    const unlabelled: Actor = { ...actor, label: "" };
    await expect(
      issueUploadUrl({
        actor: unlabelled,
        purpose: "evidence",
        contentType: "application/pdf",
        reason: REASON,
        requestId: RID.atomic,
        permissions: allow,
      }),
    ).rejects.toBeTruthy();

    const after = (await systemDb.select().from(objects)).length;
    expect(after, "the objects row survived a failed audit write").toBe(before);
  });

  it("rejects a download for another workspace's key", async () => {
    if (!ready) return;
    const otherWs = (
      await systemDb
        .insert(workspaces)
        .values({ orgId, name: `R2 Other ${Date.now()}` })
        .returning({ id: workspaces.id })
    )[0]!;
    const foreignKey = buildObjectKey({ workspaceId: otherWs.id, purpose: "evidence" });

    await expect(
      issueDownloadUrl({
        actor,
        purpose: "evidence",
        objectKey: foreignKey,
        reason: REASON,
        requestId: RID.cross,
        permissions: allow,
      }),
    ).rejects.toThrow(/different workspace/);
  });

  it("rejects a download when the purpose disagrees with the key", async () => {
    if (!ready) return;
    const key = buildObjectKey({ workspaceId: actor.workspaceId, purpose: "evidence" });
    await expect(
      issueDownloadUrl({
        actor,
        purpose: "generated_pack",
        objectKey: key,
        reason: REASON,
        requestId: RID.mismatch,
        permissions: allow,
      }),
    ).rejects.toThrow(/does not match the authorized purpose/);
  });

  it("rejects a user-controlled purpose outright", async () => {
    if (!ready) return;
    await expect(
      issueUploadUrl({
        actor,
        purpose: "payroll",
        contentType: "application/pdf",
        reason: REASON,
        requestId: RID.purpose,
        permissions: allow,
      }),
    ).rejects.toThrow(/allowlist/);
  });

  it("records a download URL and an access attempt", async () => {
    if (!ready) return;
    const key = buildObjectKey({ workspaceId: actor.workspaceId, purpose: "evidence" });
    const issued = await issueDownloadUrl({
      actor,
      purpose: "evidence",
      objectKey: key,
      reason: REASON,
      requestId: RID.download,
      permissions: allow,
    });
    expect(issued.method).toBe("GET");
    expect(issued.ttlSeconds).toBe(600);
    expect(issued.url).toContain(key);

    await recordFileAccess({
      actor,
      objectKey: key,
      operation: "download",
      outcome: "granted",
      requestId: RID.access,
      reason: REASON,
    });
    const audits = await systemDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "file.accessed"));
    const mine = audits.filter((a) => (a.meta as Record<string, unknown>)?.requestId === RID.access);
    expect(mine).toHaveLength(1);
    expect((mine[0]!.meta as Record<string, unknown>).objectKey).toBe(key);
  });

  it("audits EVERY denial path, not only the authorization refusal (F-2)", async () => {
    if (!ready) return;
    const ids = {
      cross: `req-${RUN}-dcross`,
      purpose: `req-${RUN}-dpurpose`,
      denied: `req-${RUN}-ddenied`,
    };
    const denyAll: PermissionSource = { can: () => false };
    const foreign = buildObjectKey({
      workspaceId: "9a7f5b31-2c4d-4e6f-8a91-0b1c2d3e4f50",
      purpose: "evidence",
    });

    await expect(
      issueDownloadUrl({ actor, purpose: "evidence", objectKey: foreign, reason: REASON, requestId: ids.cross, permissions: allow }),
    ).rejects.toBeTruthy();
    await expect(
      issueUploadUrl({ actor, purpose: "not_a_purpose", contentType: "application/pdf", reason: REASON, requestId: ids.purpose, permissions: allow }),
    ).rejects.toBeTruthy();
    await expect(
      issueUploadUrl({ actor, purpose: "evidence", contentType: "application/pdf", reason: REASON, requestId: ids.denied, permissions: denyAll }),
    ).rejects.toBeTruthy();

    const rows = await systemDb.select({ meta: auditEvents.meta }).from(auditEvents);
    for (const id of [ids.cross, ids.purpose, ids.denied]) {
      const mine = rows.filter((r) => (r.meta as { requestId?: string } | null)?.requestId === id);
      expect(mine, `denial not audited: ${id}`).toHaveLength(1);
      expect((mine[0]!.meta as { outcome?: string }).outcome).toBe("denied");
    }
  });

  it("records the SAME object_id on upload and download events (F-3)", async () => {
    if (!ready) return;
    const objectId = "3f0e1c22-9a11-4b33-8c44-556677889900";
    const upId = `req-${RUN}-corr-up`;
    const downId = `req-${RUN}-corr-down`;
    const up = await issueUploadUrl({
      actor, purpose: "evidence", contentType: "application/pdf",
      reason: REASON, requestId: upId, permissions: allow, objectId,
    });
    await issueDownloadUrl({
      actor, purpose: "evidence", objectKey: up.objectKey,
      reason: REASON, requestId: downId, permissions: allow,
    });
    const rows = await systemDb
      .select({ objectId: auditEvents.objectId, meta: auditEvents.meta })
      .from(auditEvents);
    const a = rows.find((r) => (r.meta as { requestId?: string } | null)?.requestId === upId);
    const b = rows.find((r) => (r.meta as { requestId?: string } | null)?.requestId === downId);
    expect(a?.objectId).toBe(objectId);
    expect(b?.objectId).toBe(objectId);
    expect(a?.objectId).toBe(b?.objectId);
  });

});
