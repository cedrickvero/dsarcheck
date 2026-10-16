import { StatePanel } from "../../_components/state-panel";

export default function CaseNotFound() {
  return (
    <StatePanel
      tone="missing"
      title="Case not found"
      body="No case with that reference exists in this workspace."
      action={{ href: "/app/cases", label: "Back to cases" }}
    />
  );
}
