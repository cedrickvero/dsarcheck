/**
 * The case cockpit.
 *
 * A case number that is missing, malformed, or belongs to another workspace ALL render
 * not-found, because RLS hides cross-tenant rows and query.ts returns null for both.
 * Returning permission-denied here would confirm the case exists elsewhere - the
 * owner-approved mapping forbids that.
 */
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth/require-auth";
import { getCaseByNumber } from "@/server/cases/query";
import { now } from "@/server/time";
import { summarise } from "@/server/cases/format";
import { CaseHeader } from "../../_components/case-header";

export const dynamic = "force-dynamic";

export default async function CaseCockpitPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const actor = await requireAuth();
  const row = await getCaseByNumber(actor, decodeURIComponent(caseId));
  if (!row) notFound();

  return (
    <>
      <p><a href="/app/cases">Back to cases</a></p>
      <CaseHeader summary={summarise(row, now())} />
      <section aria-labelledby="next-steps">
        <h2 id="next-steps">Next steps</h2>
        <p>
          Identity verification, the system checklist, evidence, redaction, erasure and approval are separate
          slices and are not implemented in this foundation.
        </p>
      </section>
    </>
  );
}
