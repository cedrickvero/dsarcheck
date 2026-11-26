/**
 * "My tasks" (docs/08 G8): a system owner's assigned systems across open cases. Verifies the
 * owner filter (only the actor's rows), the open-case filter (Completed/Rejected excluded),
 * the role gate (non-system-owners get an empty list), and the statutory-due ordering.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { systemDb } from "@/db/client";
import { cases, caseSystems, orgs, users, workspaces } from "@/db/schema";
import { hashEmail } from "@/server/auth/crypto";
import { listMyTasks } from "@/server/cases/tasks";
import type { Actor } from "@/server/auth/require-auth";

const RUN = `${Date.now()}`;
const tag = `t16mt-${RUN}`;
const caseNum = (n: number) => `DSAR-2026-${String(n).padStart(5, "0")}`;

let orgId = "";
let wsId = "";
let sysOwnerId = "";
let otherOwnerId = "";
let handlerId = "";
let sysOwner: Actor;
let handler: Actor;
let earlyCaseId = "";
let lateCaseId = "";
let closedCaseId = "";

beforeAll(async () => {
  orgId = (await systemDb.insert(orgs).values({ name: `${tag}-org`, kind: "direct" }).returning({ id: orgs.id }))[0]!.id;
  wsId = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws` }).returning({ id: workspaces.id }))[0]!.id;
  const mkUser = async (role: "system_owner" | "request_handler", label: string) =>
    (
      await systemDb
        .insert(users)
        .values({ orgId, workspaceId: wsId, email: `${tag}-${label}@example.test`, emailHash: hashEmail(`${tag}-${label}@example.test`), role, mfaRequired: "false" })
        .returning({ id: users.id })
    )[0]!.id;
  sysOwnerId = await mkUser("system_owner", "sys");
  otherOwnerId = await mkUser("system_owner", "other");
  handlerId = await mkUser("request_handler", "handler");

  const mkCase = async (n: number, status: "In progress" | "Completed", dueDays: number) =>
    (
      await systemDb
        .insert(cases)
        .values({ orgId, workspaceId: wsId, caseNumber: caseNum(n), requestType: "Access", status, receivedAt: new Date(), statutoryDueAt: new Date(Date.now() + dueDays * 86_400_000) })
        .returning({ id: cases.id })
    )[0]!.id;

  earlyCaseId = await mkCase(10000 + (Number(RUN) % 30000), "In progress", 5);
  lateCaseId = await mkCase(40000 + (Number(RUN) % 30000), "In progress", 20);
  closedCaseId = await mkCase(70000 + (Number(RUN) % 20000), "Completed", 30);

  const mkSystem = (caseId: string, key: string, name: string, ownerId: string, status: "In progress" | "Not started" | "Completed", dueAt: Date | null) =>
    systemDb.insert(caseSystems).values({ orgId, workspaceId: wsId, caseId, sourceKey: key, name, ownerId, status, dueAt });

  // The actor's tasks: "Production database" on the early case + "Stripe" on the late case.
  await mkSystem(earlyCaseId, "pg", "Production database", sysOwnerId, "In progress", new Date(Date.now() + 2 * 86_400_000));
  await mkSystem(lateCaseId, "stripe", "Stripe", sysOwnerId, "Not started", null);
  // Another owner's task (must not appear) + a task on a closed case (must not appear).
  await mkSystem(earlyCaseId, "zendesk", "Zendesk", otherOwnerId, "Not started", null);
  await mkSystem(closedCaseId, "pg", "Production database", sysOwnerId, "Completed", null);

  sysOwner = { userId: sysOwnerId, orgId, workspaceId: wsId, roles: ["system_owner"], label: `${tag}-sys`, mfaSatisfied: true };
  handler = { userId: handlerId, orgId, workspaceId: wsId, roles: ["request_handler"], label: `${tag}-handler`, mfaSatisfied: true };
});

describe("listMyTasks", () => {
  it("returns the actor's assigned systems across open cases, ordered by statutory due", async () => {
    const rows = await listMyTasks(sysOwner);
    expect(rows.map((r) => r.systemName)).toEqual(["Production database", "Stripe"]);
    expect(rows[0]!.caseNumber).toBe(caseNum(10000 + (Number(RUN) % 30000)));
    expect(rows[0]!.status).toBe("In progress");
    // Task due date is preferred over the statutory deadline when present.
    expect(rows[0]!.taskDueAt).not.toBeNull();
  });

  it("does not return another owner's systems", async () => {
    const rows = await listMyTasks(sysOwner);
    expect(rows.some((r) => r.systemName === "Zendesk")).toBe(false);
  });

  it("excludes systems on completed or rejected cases", async () => {
    const rows = await listMyTasks(sysOwner);
    expect(rows.filter((r) => r.systemName === "Production database")).toHaveLength(1);
  });

  it("returns an empty list for a non-system-owner", async () => {
    expect(await listMyTasks(handler)).toEqual([]);
  });
});
