/**
 * Case-overview projection for the cockpit: the case row plus its data-source checklist
 * progress. Read-only; every query runs under withTenant so RLS scopes it to the actor's
 * workspace (a cross-tenant case number returns null, indistinguishable from a missing one).
 */
import { asc, eq } from "drizzle-orm";
import { caseSystems } from "@/db/schema";
import { withTenant } from "@/db/client";
import type { Actor } from "@/server/auth/require-auth";
import { getCaseByNumber, type CaseRow } from "./query";

/** The three checklist statuses that count as "done" for the progress figure (docs/03 E1). */
const DONE_STATUSES = ["Completed", "Not found", "Retained under exception"];

export interface SystemProgress {
  name: string;
  status: string;
  evidenceCount: number;
}

export interface CaseOverview {
  case: CaseRow;
  systemsDone: number;
  systemsTotal: number;
  systems: SystemProgress[];
}

export async function getCaseOverview(
  actor: Actor,
  caseNumber: string,
): Promise<CaseOverview | null> {
  const row = await getCaseByNumber(actor, caseNumber);
  if (!row) return null;

  const systems = await withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const rows = await tx
        .select({
          name: caseSystems.name,
          status: caseSystems.status,
          evidenceCount: caseSystems.evidenceCount,
        })
        .from(caseSystems)
        .where(eq(caseSystems.caseId, row.id))
        .orderBy(asc(caseSystems.name));
      return rows.map((r) => ({ name: r.name, status: r.status, evidenceCount: r.evidenceCount }));
    },
  );

  return {
    case: row,
    systemsDone: systems.filter((s) => DONE_STATUSES.includes(s.status)).length,
    systemsTotal: systems.length,
    systems,
  };
}
