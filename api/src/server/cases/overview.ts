/**
 * Case-overview projection for the cockpit: the case row plus its data-source checklist
 * progress and the requester's inbound messages (G18). Read-only; every query runs under
 * withTenant so RLS scopes it to the actor's workspace (a cross-tenant case number returns
 * null, indistinguishable from a missing one).
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { caseSystems, communications } from "@/db/schema";
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

export interface InboundMessage {
  id: string;
  subject: string;
  body: string;
  at: Date;
}

export interface CaseOverview {
  case: CaseRow;
  systemsDone: number;
  systemsTotal: number;
  systems: SystemProgress[];
  inboundMessages: InboundMessage[];
}

export async function getCaseOverview(
  actor: Actor,
  caseNumber: string,
): Promise<CaseOverview | null> {
  const row = await getCaseByNumber(actor, caseNumber);
  if (!row) return null;

  const { systems, messages } = await withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      const sysRows = await tx
        .select({
          name: caseSystems.name,
          status: caseSystems.status,
          evidenceCount: caseSystems.evidenceCount,
        })
        .from(caseSystems)
        .where(eq(caseSystems.caseId, row.id))
        .orderBy(asc(caseSystems.name));

      const msgRows = await tx
        .select({
          id: communications.id,
          subject: communications.subject,
          body: communications.body,
          at: communications.at,
        })
        .from(communications)
        .where(and(eq(communications.caseId, row.id), eq(communications.direction, "Inbound")))
        .orderBy(desc(communications.at));

      return {
        systems: sysRows.map((r) => ({ name: r.name, status: r.status, evidenceCount: r.evidenceCount })),
        messages: msgRows.map((r) => ({ id: r.id, subject: r.subject, body: r.body, at: r.at })),
      };
    },
  );

  return {
    case: row,
    systemsDone: systems.filter((s) => DONE_STATUSES.includes(s.status)).length,
    systemsTotal: systems.length,
    systems,
    inboundMessages: messages,
  };
}
