import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Scaffold subset of docs/04-data-model.md.
 *
 * The full entity set (cases, identity verification, checklist rows, evidence
 * items, redactions, approvals, audit events, support grants, billing) lands in
 * the data slice. This file exists so db/client and the migrations pipeline are
 * wired end to end.
 *
 * Invariant: every customer-owned table carries workspace_id (and org_id) so
 * Postgres RLS can enforce tenant isolation in the database, not just in
 * application code.
 *
 * NOTE: migration 0001 already adds orgs, so 0000 is not stale.
 */

export const orgs = pgTable("orgs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["direct", "agency"] })
    .notNull()
    .default("direct"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    name: text("name").notNull(),
    subdomain: text("subdomain"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("workspaces_org_id_idx").on(table.orgId)],
);
