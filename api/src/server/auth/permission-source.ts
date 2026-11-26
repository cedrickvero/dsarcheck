/**
 * The production permission source for the R2 file/URL contract. `issueUploadUrl` and
 * `issueDownloadUrl` authorize against the permission names `files.upload` /
 * `files.download` (from storage/purpose.ts), which are NOT in the authz role matrix — they
 * are storage-layer operation names, not role permissions. This maps them to the case-file
 * permission (`export_evidence_packs`), and passes every other permission straight through to
 * the role matrix.
 */
import { can, type Permission } from "@/server/authz";
import type { PermissionSource } from "./authorize";

const FILE_OPERATIONS = new Set(["files.upload", "files.download"]);

export const workspacePermissionSource: PermissionSource = {
  can: ({ actor, permission }) => {
    if (FILE_OPERATIONS.has(permission)) {
      return actor.roles.some((r) => can(r, "export_evidence_packs"));
    }
    return actor.roles.some((r) => can(r, permission as Permission));
  },
};
