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
import { getIdentity } from "@/server/cases/identity";
import { getApproval } from "@/server/cases/approval";
import { getErasureOutcomes } from "@/server/cases/erasure";
import { can } from "@/server/authz";
import { now } from "@/server/time";
import { summarise } from "@/server/cases/format";
import { CaseHeader } from "../../_components/case-header";
import { CockpitTabs, resolveCockpitTab } from "../../_components/cockpit-tabs";
import { OverviewTab } from "../../_components/overview-tab";
import { AuditTab } from "../../_components/audit-tab";
import { ChecklistTab } from "../../_components/checklist-tab";
import { IdentityTab } from "../../_components/identity-tab";
import { ApprovalTab } from "../../_components/approval-tab";
import { ErasureTab } from "../../_components/erasure-tab";
import { TabStub } from "../../_components/tab-stub";
import { setSystemStatus, recordIdentityDecision, selectTemplate, sendForApproval, approveAndClose, requestChanges, rejectCase, recordErasureOutcome } from "../actions";

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
      {tab === "identity" ? (
        <IdentityTab
          caseId={overview.case.id}
          caseNumber={overview.case.caseNumber}
          identity={await getIdentity(actor, overview.case.id).then((i) => i ?? notFound())}
          canDecide={actor.roles.some((r) => can(r, "approve_identity"))}
          action={recordIdentityDecision}
        />
      ) : null}
      {tab === "checklist" ? (
        <ChecklistTab
          caseId={overview.case.id}
          caseNumber={overview.case.caseNumber}
          deadline={overview.case.statutoryDueAt}
          systems={await listCaseSystems(actor, overview.case.id)}
          action={setSystemStatus}
        />
      ) : null}
      {tab === "collection" ? (
        overview.case.requestType === "Erasure" ? (
          <ErasureTab
            caseId={overview.case.id}
            caseNumber={overview.case.caseNumber}
            view={await getErasureOutcomes(actor, overview.case.id).then((v) => v ?? notFound())}
            action={recordErasureOutcome}
          />
        ) : (
          stub(collectionTitle, `${collectionTitle} is a separate slice and is not implemented in this foundation.`)
        )
      ) : null}
      {tab === "approval" ? (
        <ApprovalTab
          caseId={overview.case.id}
          caseNumber={overview.case.caseNumber}
          view={await getApproval(actor, overview.case.id).then((v) => v ?? notFound())}
          actions={{ selectTemplate, sendForApproval, approveAndClose, requestChanges, rejectCase }}
        />
      ) : null}
      {tab === "evidence"
        ? stub("Evidence pack", "The evidence pack is a separate slice and is not implemented in this foundation.")
        : null}
    </>
  );
}
