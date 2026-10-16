"use client";

/**
 * Error boundary. A client component by necessity, but it performs NO data access and
 * receives no data - it renders a fixed message, so nothing can leak through it.
 */
import { StatePanel } from "./_components/state-panel";

export default function WorkspaceError() {
  return (
    <StatePanel
      tone="error"
      title="Something went wrong"
      body="This page could not be loaded. The failure has been recorded; try again shortly."
      action={{ href: "/app/cases", label: "Back to cases" }}
    />
  );
}
