import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemDb, systemPool } from "@/db/client";
import { auditEvents, orgs, workspaces } from "@/db/schema";
import type { PermissionSource } from "@/server/auth/authorize";
import type { Actor } from "@/server/auth/require-auth";
import { ERASURE_PERMISSIONS, recordErasureOutcome } from "@/server/erasure/decide";

/**
 * The human-gated decision path, exercised against the real database.
 *
 * The reason these are DB-backed rather than mocked: the whole point of the contract is
 * that a decision and its immutable audit event commit TOGETHER. A mock cannot show that,
 * and cannot show that a rollback leaves neither behind.
 */
const RUN = Date.now().toString();
const allow: PermissionSource = { can: () => true };
const denyAll: PermissionSource = { can: () => false };
const denyHighRisk: PermissionSource = {
  can: ({ permission }) => permission !== ERASURE_PERMISSIONS.recordHighRisk,
};

let ready = false;
let handler: Actor;
let approver: Actor;

const base = (over: Record<string, unknown> = {}, requestId = `req-${RUN}-x`) => ({
  actor: handler as Actor | null,
  requestId,
  permissions: allow,
  decision: {
    systemRef: "mixpanel",
    outcome: "deleted",
    reason: "system owner confirmed deletion and attached evidence",
    evidenceRef: "outcome-mixpanel.pdf",
    ...over,
  },
});

async function rowsFor(requestId: string) {
  const rows = await systemDb
    .select({ meta: auditEvents.meta, actorId: auditEvents.actorId, reason: auditEvents.reason, action: auditEvents.action })
    .from(auditEvents);
  return rows.filter((r) => (r.meta as { requestId?: string } | null)?.requestId === requestId);
}

beforeAll(async () => {
  try {
    const tag = `e4-${RUN}`;
    const org = (await systemDb.insert(orgs).values({ name: `${tag}-org` }).returning({ id: orgs.id }))[0]!;
    const ws = (await systemDb.insert(workspaces).values({ orgId: org.id, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!;
    handler = { userId: `user-${tag}`, label: "E4 Handler", orgId: org.id, workspaceId: ws.id, roles: ["request_handler"] };
    approver = { ...handler, userId: `approver-${tag}`, label: "E4 Approver", roles: ["approver"] };
    await systemDb.select({ id: auditEvents.id }).from(auditEvents).limit(1);
    ready = true;
  } catch {
    ready = false;
  }
});

afterAll(async () => {
  await systemPool.end().catch(() => {});
});

describe("erasure decision path (R4)", () => {
  it("records each of the five outcomes, writing one audit event per decision", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    const cases: Array<{ outcome: string; extra: Record<string, unknown> }> = [
      { outcome: "deleted", extra: {} },
      { outcome: "suppressed", extra: {} },
      { outcome: "not_found", extra: {} },
      { outcome: "action_required", extra: { evidenceRef: undefined } },
      { outcome: "retained_under_exception", extra: { exceptionCategory: "Fraud prevention" } },
    ];
    for (const { outcome, extra } of cases) {
      const id = `req-${RUN}-ok-${outcome}`;
      const recorded = await recordErasureOutcome(base({ outcome, ...extra }, id));
      expect(recorded.outcome, outcome).toBe(outcome);
      expect(recorded.decidedBy, outcome).toBe(handler.userId);
      const rows = await rowsFor(id);
      expect(rows, `${outcome} should write exactly one audit event`).toHaveLength(1);
      expect(rows[0]!.action).toBe("erasure.outcome.recorded");
      expect(rows[0]!.actorId).toBe(handler.userId);
    }
  });

  it("fails loudly on a missing actor, and writes nothing", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    const id = `req-${RUN}-noactor`;
    await expect(
      recordErasureOutcome({ ...base({}, id), actor: null }),
    ).rejects.toThrow(/named human actor/);
    expect(await rowsFor(id)).toHaveLength(0);
  });

  it("refuses a system/worker/cron actor - there is no autonomous path", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    for (const robotId of ["system", "worker", "cron"]) {
      const id = `req-${RUN}-robot-${robotId}`;
      await expect(
        recordErasureOutcome({ ...base({}, id), actor: { ...handler, userId: robotId } }),
      ).rejects.toThrow(/never decided autonomously/);
      expect(await rowsFor(id), robotId).toHaveLength(0);
    }
  });

  it("refuses a missing, empty or whitespace-only reason", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    for (const reason of [undefined, "", "   "]) {
      const id = `req-${RUN}-reason-${String(reason)}`;
      // zod's message differs by failure mode ("Required" vs the .min(1) message); the
      // contract is that it REJECTS and writes nothing.
      await expect(
        recordErasureOutcome(base({ reason }, id)),
      ).rejects.toThrow(/reason/i);
      expect(await rowsFor(id)).toHaveLength(0);
    }
  });

  it("refuses Retained under exception without a category, and with an invented category", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    // NB: the schema trims, so "Fraud prevention " is correctly accepted as
    // "Fraud prevention". These are invalid for real.
    for (const exceptionCategory of [undefined, "", "tax", "fraud prevention"]) {
      const id = `req-${RUN}-cat-${String(exceptionCategory)}`;
      await expect(
        recordErasureOutcome(base({ outcome: "retained_under_exception", exceptionCategory }, id)),
      ).rejects.toThrow(/retention exception category/);
      expect(await rowsFor(id)).toHaveLength(0);
    }
  });

  it("requires evidence or an attached outcome record for the four closing outcomes", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    for (const outcome of ["deleted", "suppressed", "not_found", "retained_under_exception"]) {
      const id = `req-${RUN}-ev-${outcome}`;
      await expect(
        recordErasureOutcome(
          base(
            {
              outcome,
              evidenceRef: undefined,
              hasOutcomeRecord: false,
              exceptionCategory: outcome === "retained_under_exception" ? "Fraud prevention" : undefined,
            },
            id,
          ),
        ),
      ).rejects.toThrow(/requires evidence or an automatically attached outcome record/);
      expect(await rowsFor(id)).toHaveLength(0);
    }
  });

  it("accepts an auto-attached outcome record in place of evidence", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    const id = `req-${RUN}-record`;
    const recorded = await recordErasureOutcome(
      base({ evidenceRef: undefined, hasOutcomeRecord: true }, id),
    );
    expect(recorded.hasOutcomeRecord).toBe(true);
    expect(await rowsFor(id)).toHaveLength(1);
  });

  it("refuses an invalid outcome", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    for (const outcome of ["purged", "Deleted", "", null]) {
      const id = `req-${RUN}-bad-${String(outcome)}`;
      await expect(
        recordErasureOutcome(base({ outcome, evidenceRef: "e.pdf" }, id)),
      ).rejects.toThrow(/invalid erasure outcome|Expected string/i);
      expect(await rowsFor(id)).toHaveLength(0);
    }
  });

  it("fails loudly when authorization is denied, and writes nothing", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    const id = `req-${RUN}-denied`;
    await expect(
      recordErasureOutcome({ ...base({}, id), permissions: denyAll }),
    ).rejects.toThrow(/authorization denied/i);
    expect(await rowsFor(id)).toHaveLength(0);
  });

  it("refuses a high-risk decision from a non-approver", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    const id = `req-${RUN}-highrisk`;
    await expect(
      recordErasureOutcome(base({ risk: "high" }, id)),
    ).rejects.toThrow(/approver role required/i);
    expect(await rowsFor(id)).toHaveLength(0);
  });

  it("refuses a high-risk decision when the high-risk permission is not granted", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    const id = `req-${RUN}-highrisk-perm`;
    await expect(
      recordErasureOutcome({
        ...base({ risk: "high" }, id),
        actor: approver,
        permissions: denyHighRisk,
      }),
    ).rejects.toThrow(/authorization denied/i);
    expect(await rowsFor(id)).toHaveLength(0);
  });

  it("allows an approver to make a high-risk decision", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    const id = `req-${RUN}-highrisk-ok`;
    const recorded = await recordErasureOutcome({ ...base({ risk: "high" }, id), actor: approver });
    expect(recorded.risk).toBe("high");
    expect(await rowsFor(id)).toHaveLength(1);
  });

  it("refuses the requester deciding their own case", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    const id = `req-${RUN}-requester`;
    await expect(
      recordErasureOutcome({ ...base({}, id), requesterActorId: handler.userId }),
    ).rejects.toThrow(/requester cannot decide/i);
    expect(await rowsFor(id)).toHaveLength(0);
  });

  it("commits the decision and its audit event together", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    const id = `req-${RUN}-atomic`;
    const recorded = await recordErasureOutcome(base({}, id));
    const rows = await rowsFor(id);
    // both sides present: a decision was returned AND its event exists
    expect(recorded.systemRef).toBe("mixpanel");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reason).toContain("confirmed deletion");
  });

  it("rolls back BOTH the decision and its audit event when the transaction fails", async () => {
    if (!ready) throw new Error("erasure-decision: database unavailable, asserted nothing");
    // The actor's workspace does not exist, so the audit row's foreign key fails INSIDE the
    // transaction - after the point where a decision would have been produced.
    const id = `req-${RUN}-rollback`;
    const ghost: Actor = {
      ...handler,
      userId: `ghost-${RUN}`,
      label: "Ghost Actor",
      workspaceId: "00000000-0000-4000-8000-000000000000",
    };
    let caught: unknown;
    try {
      await recordErasureOutcome({ ...base({}, id), actor: ghost });
    } catch (error) {
      caught = error;
    }
    expect(caught, "a failed transaction must not return a decision").toBeTruthy();
    expect(await rowsFor(id), "the audit event must not survive the rollback").toHaveLength(0);
  });

  it("leaves the erasure route stub at 501 (R4 adds no route)", async () => {
    const route = await import("@/app/api/erasure/[[...path]]/route");
    const res = await route.GET(
      new Request("http://localhost/api/erasure") as never,
      { params: Promise.resolve({}) } as never,
    );
    expect(res.status).toBe(501);
  });
});
