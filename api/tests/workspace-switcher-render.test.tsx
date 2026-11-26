import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceSwitcher } from "@/app/app/_components/workspace-switcher";

const noop = async () => ({ ok: true });

const agencyCtx = {
  orgId: "org1",
  orgName: "Northlight Privacy",
  orgKind: "agency" as const,
  currentWorkspaceId: "ws1",
  workspaces: [
    { workspaceId: "ws1", name: "Northlight Privacy", role: "owner", isCurrent: true },
    { workspaceId: "ws2", name: "Kesto Health", role: "approver", isCurrent: false },
  ],
};

const directCtx = {
  orgId: "org2",
  orgName: "Lumen Analytics",
  orgKind: "direct" as const,
  currentWorkspaceId: "ws3",
  workspaces: [{ workspaceId: "ws3", name: "Lumen Analytics", role: "owner", isCurrent: true }],
};

describe("WorkspaceSwitcher", () => {
  it("renders the agency switcher trigger with the current client", () => {
    const html = renderToStaticMarkup(<WorkspaceSwitcher context={agencyCtx} onSwitch={noop} />);
    expect(html).toContain("Client workspace");
    expect(html).toContain("Northlight Privacy");
    expect(html).toContain("aria-haspopup=\"menu\"");
  });

  it("renders the direct static block with no switcher trigger", () => {
    const html = renderToStaticMarkup(<WorkspaceSwitcher context={directCtx} onSwitch={noop} />);
    expect(html).toContain("Workspace");
    expect(html).toContain("Lumen Analytics");
    expect(html).not.toContain("Client workspace");
    expect(html).not.toContain("aria-haspopup");
  });
});
