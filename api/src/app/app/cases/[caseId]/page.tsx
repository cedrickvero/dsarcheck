/**
 * The case cockpit.
 *
 * A case number that is missing, malformed, or belongs to another workspace ALL render
 * not-found, because RLS hides cross-tenant rows and getCaseOverview returns null for both.
 * Returning permission-denied here would confirm the case exists elsewhere - the
 * owner-approved mapping forbids that.
 *
 * Tabs are in the URL (?tab=) so links and back/forward work. Overview and Audit are real;
 * Identity, Checklist, Collection/Erasure, Approval and Evidence are later slices and
 * render an honest placeholder rather than a silent omission.
 */
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth/require-auth";
import { getCaseOverview } from "@/server/cases/overview";
import { listCaseAuditEvents } from "@/server/cases/audit";
import { listCaseSystems } from "@/server/cases/checklist";
import { now } from "@/server/time";
import { summarise } from "@/server/cases/format";
import { CaseHeader } from "../../_components/case-header";
import { CockpitTabs, resolveCockpitTab } from "../../_components/cockpit-tabs";
import { OverviewTab } from "../../_components/overview-tab";
import { AuditTab } from "../../_components/audit-tab";
import { ChecklistTab } from "../../_components/checklist-tab";
import { TabStub } from "../../_components/tab-stub";
import { setSystemStatus } from "../actions";

export const dynamic = "force-dynamic";

export default async function CaseCockpitPage(props: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { caseId } = await props.params;
  const sp = await props.searchParams;
  const actor = await requireAuth();

  const number = decodeURIComponent(caseId);
  const overview = await getCaseOverview(actor, number);
  if (!overview) notFound();

  const raw = typeof sp.tab === "string" ? sp.tab : undefined;
  const tab = resolveCockpitTab(raw);

  const collectionTitle = overview.case.requestType === "Erasure" ? "Erasure outcomes" : "Collection & redaction";
  const stub = (title: string, body: string) => <TabStub title={title} body={body} />;

  return (
    <>
      <p>
        <a href="/app/cases">Back to cases</a>
      </p>
      <CaseHeader summary={summarise(overview.case, now())} />
      <CockpitTabs
        active={tab}
        requestType={overview.case.requestType}
        systemsDone={overview.systemsDone}
        systemsTotal={overview.systemsTotal}
      />

      {tab === "overview" ? <OverviewTab overview={overview} /> : null}
      {tab === "audit" ? <AuditTab events={await listCaseAuditEvents(actor, overview.case.id)} /> : null}
      {tab === "identity"
        ? stub("Identity", "Identity verification is a separate slice and is not implemented in this foundation.")
        : null}
      {tab === "checklist" ? (
        <ChecklistTab
          caseId={overview.case.id}
          caseNumber={overview.case.caseNumber}
          deadline={overview.case.statutoryDueAt}
          systems={await listCaseSystems(actor, overview.case.id)}
          action={setSystemStatus}
        />
      ) : null}
      {tab === "collection"
        ? stub(collectionTitle, `${collectionTitle} is a separate slice and is not implemented in this foundation.`)
        : null}
      {tab === "approval"
        ? stub("Approval & response", "Approval & response is a separate slice and is not implemented in this foundation.")
        : null}
      {tab === "evidence"
        ? stub("Evidence pack", "The evidence pack is a separate slice and is not implemented in this foundation.")
        : null}
    </>
  );
}
