/**
 * Development seed: ONLY the cases the case list and cockpit need.
 *
 * Deliberately narrow - no requesters, identity verification, checklists, tasks, files,
 * redactions, erasure outcomes, approvals, evidence packs or full prototype data.
 *
 * Refuses to run in production. Seed data is a development affordance; a production
 * database containing prototype cases would be a privacy incident, so the guard is a
 * hard throw rather than a warning.
 *
 * Case numbers are the prototype's (docs/04: DSAR-2026-00418, DSAR-2026-00287) so the
 * screens match the handoff. Because they are inserted directly, case_number_seq is
 * advanced past the highest seeded value afterwards - otherwise the first case created
 * after seeding would collide with a seeded number.
 */
import { sql } from "drizzle-orm";
import { systemDb, systemPool } from "@/db/client";
import { cases, caseNumberSeq } from "@/db/schema";

interface SeedCase {
  caseNumber: string;
  requestType: (typeof cases.$inferInsert)["requestType"];
  priority: (typeof cases.$inferInsert)["priority"];
  status: (typeof cases.$inferInsert)["status"];
  receivedAt: string;
  dueAt: string;
}

const SEED_CASES: SeedCase[] = [
  { caseNumber: "DSAR-2026-00418", requestType: "Access", priority: "High", status: "In progress", receivedAt: "2026-10-01T09:12:00Z", dueAt: "2026-10-31T09:12:00Z" },
  { caseNumber: "DSAR-2026-00287", requestType: "Rectification", priority: "Normal", status: "Completed", receivedAt: "2026-09-18T14:05:00Z", dueAt: "2026-10-18T14:05:00Z" },
  { caseNumber: "DSAR-2026-00419", requestType: "Erasure", priority: "Normal", status: "New", receivedAt: "2026-10-12T08:40:00Z", dueAt: "2026-11-11T08:40:00Z" },
  { caseNumber: "DSAR-2026-00420", requestType: "Portability", priority: "Normal", status: "Verifying", receivedAt: "2026-10-08T11:20:00Z", dueAt: "2026-10-15T11:20:00Z" },
  { caseNumber: "DSAR-2026-00421", requestType: "Access", priority: "High", status: "Awaiting approval", receivedAt: "2026-09-30T16:30:00Z", dueAt: "2026-10-14T16:30:00Z" },
  { caseNumber: "DSAR-2026-00422", requestType: "Objection", priority: "Normal", status: "Extended", receivedAt: "2026-09-25T10:00:00Z", dueAt: "2026-11-24T10:00:00Z" },
];

export const SEED_ORG_NAME = "Northwind Privacy (seed)";
export const SEED_WORKSPACE_NAME = "Northwind (seed)";

export async function seedCases(): Promise<{ orgId: string; workspaceId: string; seeded: number }> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed: refusing to run in production - seed data must never reach a live database");
  }

  const org = (
    await systemDb.execute<{ id: string }>(sql`
      insert into orgs (name) values (${SEED_ORG_NAME})
      on conflict do nothing returning id
    `)
  ).rows[0];

  const orgId =
    org?.id ??
    (await systemDb.execute<{ id: string }>(sql`select id from orgs where name = ${SEED_ORG_NAME} limit 1`)).rows[0]!
      .id;

  const ws = (
    await systemDb.execute<{ id: string }>(sql`
      insert into workspaces (org_id, name, subdomain) values (${orgId}::uuid, ${SEED_WORKSPACE_NAME}, 'northwind-seed')
      on conflict do nothing returning id
    `)
  ).rows[0];

  const workspaceId =
    ws?.id ??
    (await systemDb.execute<{ id: string }>(sql`select id from workspaces where name = ${SEED_WORKSPACE_NAME} limit 1`))
      .rows[0]!.id;

  let seeded = 0;
  for (const c of SEED_CASES) {
    const exists = await systemDb.execute<{ n: number }>(
      sql`select count(*)::int as n from cases where workspace_id = ${workspaceId}::uuid and case_number = ${c.caseNumber}`,
    );
    if ((exists.rows[0]?.n ?? 0) > 0) continue;
    await systemDb.insert(cases).values({
      orgId,
      workspaceId,
      caseNumber: c.caseNumber,
      requestType: c.requestType,
      priority: c.priority,
      status: c.status,
      receivedAt: new Date(c.receivedAt),
      statutoryDueAt: new Date(c.dueAt),
    });
    seeded += 1;
  }

  // Keep the allocator ahead of seeded numbers, or the next created case collides.
  const year = 2026;
  const maxSeq = Math.max(...SEED_CASES.map((c) => Number(c.caseNumber.split("-")[2])));
  await systemDb.execute(sql`
    insert into case_number_seq (workspace_id, year, next_value) values (${workspaceId}::uuid, ${year}, ${maxSeq + 1})
    on conflict (workspace_id, year) do update set next_value = greatest(case_number_seq.next_value, ${maxSeq + 1})
  `);

  return { orgId, workspaceId, seeded };
}

/** CLI entry: `npx tsx src/db/seed.ts`. */
if (process.argv[1]?.includes("seed")) {
  seedCases()
    .then(async (r) => {
      console.log(`seed: ${r.seeded} case(s) in workspace ${r.workspaceId}`);
      await systemPool.end();
    })
    .catch(async (e) => {
      console.error("seed failed:", e instanceof Error ? e.message : e);
      await systemPool.end();
      process.exit(1);
    });
}
