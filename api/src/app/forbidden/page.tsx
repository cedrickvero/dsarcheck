import { StatePanel } from "../app/_components/state-panel";

/** 403: authenticated, but the role lacks the permission. Distinct from not-found. */
export default function ForbiddenPage() {
  return (
    <main className="shell" id="main">
      <StatePanel
        tone="denied"
        title="Permission denied"
        body="Your role does not permit viewing this. Ask a workspace admin if you need access."
        action={{ href: "/app", label: "Back to dashboard" }}
      />
    </main>
  );
}
