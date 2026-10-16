import { requireAuth } from "@/server/auth/require-auth";
import { listCases } from "@/server/cases/query";
import { now } from "@/server/time";
import { summarise } from "@/server/cases/format";
import { CaseTable } from "../_components/case-table";
import { StatePanel } from "../_components/state-panel";

export const dynamic = "force-dynamic";

export default async function CaseListPage() {
  const actor = await requireAuth();
  const rows = await listCases(actor);

  if (rows.length === 0) {
    return (
      <>
        <h1>Cases</h1>
        <StatePanel
          tone="empty"
          title="No cases yet"
          body="When a data subject request arrives in this workspace it will appear here."
        />
      </>
    );
  }

  const at = now();
  return (
    <>
      <h1>Cases</h1>
      <CaseTable rows={rows.map((r) => summarise(r, at))} />
    </>
  );
}
