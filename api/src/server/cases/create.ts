/**
 * Case creation: number allocation, insert and audit in ONE transaction.
 *
 * The owner requires the audit event to be written atomically with the case, so this is
 * always called inside a withTenant transaction.
 *
 * There is deliberately NO route for this. Public intake is out of T-07's scope; the
 * function exists so the numbering and audit invariants are testable, and so the intake
 * slice has one correct path to call rather than inventing its own.
 */
import { sql } from "drizzle-orm";
import { cases, type PRIORITIES, type REQUEST_TYPES } from "@/db/schema";
import type { Transaction } from "@/db/client";
import { writeAuditEvent } from "@/server/db/audit";

export type RequestType = (typeof REQUEST_TYPES)[number];
export type Priority = (typeof PRIORITIES)[number];

export interface CreateCaseArgs {
  orgId: string;
  workspaceId: string;
  actorId: string;
  actorLabel: string;
  requestType: RequestType;
  priority?: Priority;
  receivedAt: Date;
  statutoryDueAt: Date;
}

export function formatCaseNumber(year: number, sequence: number): string {
  return `DSAR-${year}-${String(sequence).padStart(5, "0")}`;
}

/**
 * Allocate the next case number for a workspace and year.
 *
 * ONE statement, so Postgres takes the row lock itself: two concurrent creates cannot be
 * handed the same number, and there is no application-level lock or retry loop to get
 * subtly wrong. `VALUES (..., 1)` with `DO UPDATE SET next_value = next_value + 1` hands
 * out 1, 2, 3, ... - the first insert returns its own seed, each conflict increments.
 */
export async function allocateCaseNumber(
  tx: Transaction,
  args: { workspaceId: string; year: number },
): Promise<number> {
  const result = await tx.execute<{ next_value: number }>(sql`
    insert into case_number_seq (workspace_id, year, next_value)
    values (${args.workspaceId}::uuid, ${args.year}, 1)
    on conflict (workspace_id, year)
      do update set next_value = case_number_seq.next_value + 1
    returning next_value
  `);
  const row = (result.rows ?? [])[0];
  if (!row) throw new Error("case: could not allocate a case number");
  return Number(row.next_value);
}

export async function createCase(
  tx: Transaction,
  args: CreateCaseArgs,
): Promise<{ id: string; caseNumber: string }> {
  const year = args.receivedAt.getUTCFullYear();
  const sequence = await allocateCaseNumber(tx, { workspaceId: args.workspaceId, year });
  const caseNumber = formatCaseNumber(year, sequence);

  const [row] = await tx
    .insert(cases)
    .values({
      orgId: args.orgId,
      workspaceId: args.workspaceId,
      caseNumber,
      requestType: args.requestType,
      priority: args.priority ?? "Normal",
      status: "New",
      receivedAt: args.receivedAt,
      statutoryDueAt: args.statutoryDueAt,
    })
    .returning({ id: cases.id });
  if (!row) throw new Error("case: insert returned no row");

  await writeAuditEvent(tx, {
    orgId: args.orgId,
    workspaceId: args.workspaceId,
    actorId: args.actorId,
    actorLabel: args.actorLabel,
    action: "case.created",
    category: "Intake",
    reason: `Case ${caseNumber} created`,
    objectType: "case",
    objectId: row.id,
    meta: { caseNumber, requestType: args.requestType },
  });

  return { id: row.id, caseNumber };
}
