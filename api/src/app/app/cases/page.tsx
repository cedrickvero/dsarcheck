import { requireAuth } from "@/server/auth/require-auth";
import { now } from "@/server/time";
import { formatDate } from "@/server/cases/format";
import { listAssignableOwners, listCaseListRows, workspaceNameFor } from "@/server/cases/query";
import {
  CASE_LIST_COPY,
  DEFAULT_FILTERS,
  filterRows,
  parseFilters,
  viewCounts,
  type CaseListRow,
} from "@/domain/caseList";
import { sla } from "@/domain/sla";
import { CaseList } from "../_components/case-list";
import { assignOwner, exportCases } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The case list.
 *
 * Server Component: it authenticates, reads the tenant-scoped rows, derives the views and
 * formats every date and SLA label HERE - so the client never has to guess a timezone and
 * never receives a row it was not allowed to see. Filtering is pure and unit-tested in
 * `domain/caseList`; only the interactivity is client-side.
 */
export default async function CaseListPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAuth();
  const filters = parseFilters(await props.searchParams);
  const at = now();

  const [rows, owners, client] = await Promise.all([
    listCaseListRows(actor),
    listAssignableOwners(actor),
    workspaceNameFor(actor),
  ]);

  const ctx = { viewerId: actor.userId, now: at };
  const counts = viewCounts(rows, ctx);
  const visible = filterRows(rows, filters, ctx);

  const toView = (row: CaseListRow) => {
    const state = sla({
      status: row.status,
      receivedAt: row.receivedAt,
      extensionMonths: row.extensionMonths,
      closedAt: null,
      now: at,
    });
    return {
      caseNumber: row.caseNumber,
      requesterName: row.requesterName,
      requesterEmail: row.requesterEmail,
      requestType: row.requestType,
      status: row.status,
      statusLabel: row.status,
      ownerName: row.ownerName,
      received: formatDate(row.receivedAt),
      sla: { label: state.label, risk: state.risk, pct: state.pct },
      checklist: CASE_LIST_COPY.checklist(row.checklistDone, row.checklistTotal),
      priority: row.priority,
    };
  };

  const filtersActive =
    filters.view !== DEFAULT_FILTERS.view ||
    filters.q !== "" ||
    filters.type !== "All" ||
    filters.status !== "All";

  return (
    <CaseList
      client={client}
      rows={visible.map(toView)}
      counts={counts}
      view={filters.view}
      q={filters.q}
      type={filters.type}
      status={filters.status}
      owners={owners}
      intakeHref="/intake"
      assign={assignOwner}
      exportCsv={exportCases}
      filtersActive={filtersActive}
    />
  );
}
