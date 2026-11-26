import { describe, expect, it } from "vitest";
import { workspacePermissionSource } from "@/server/auth/permission-source";
import type { Actor } from "@/server/auth/require-auth";
import type { Role } from "@/server/auth/require-auth";

const actor = (role: Role): Actor => ({ userId: "u", orgId: "o", workspaceId: "w", roles: [role], label: "x", mfaSatisfied: true });

describe("workspacePermissionSource", () => {
  it("maps the storage operation names to the case-file permission", () => {
    // export_evidence_packs = owner / workspace_admin / request_handler / approver.
    expect(workspacePermissionSource.can({ actor: actor("owner"), workspaceId: "w", permission: "files.upload" })).toBe(true);
    expect(workspacePermissionSource.can({ actor: actor("request_handler"), workspaceId: "w", permission: "files.download" })).toBe(true);
    // system_owner works cases but is NOT in export_evidence_packs -> denied.
    expect(workspacePermissionSource.can({ actor: actor("system_owner"), workspaceId: "w", permission: "files.upload" })).toBe(false);
  });

  it("passes every other permission straight through to the role matrix", () => {
    expect(workspacePermissionSource.can({ actor: actor("owner"), workspaceId: "w", permission: "export_evidence_packs" })).toBe(true);
    expect(workspacePermissionSource.can({ actor: actor("system_owner"), workspaceId: "w", permission: "export_evidence_packs" })).toBe(false);
    // Unknown permission -> matrix denies (fails closed).
    expect(workspacePermissionSource.can({ actor: actor("owner"), workspaceId: "w", permission: "bogus.permission" })).toBe(false);
  });
});
