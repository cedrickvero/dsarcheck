-- Tie a membership's org to the workspace's OWN org: a composite FK so an (org A, workspace
-- of org B) row is structurally impossible, not merely unlikely. memberships is the first
-- org-scoped table, and its org_id must never disagree with the workspace's org_id.
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_id_org_id_unique" UNIQUE ("id", "org_id");
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_org_fk"
  FOREIGN KEY ("workspace_id", "org_id") REFERENCES "public"."workspaces"("id", "org_id") ON DELETE no action ON UPDATE no action;
