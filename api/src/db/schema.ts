import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

/**
 * Append-only audit trail (docs/05 § "Reason-required actions", AGENTS.md #1).
 *
 * Invariants enforced in the database, not by convention (see migration 0002):
 *   - RLS is ENABLED + FORCED; rows are visible only to the owning workspace.
 *   - A BEFORE UPDATE OR DELETE trigger raises, so history cannot be rewritten.
 * Every sensitive action writes a row here in the SAME transaction as the change,
 * via `mutate()` in src/server/db/mutate.ts.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
    actorId: text("actor_id").notNull(),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    category: text("category").notNull(),
    reason: text("reason").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id"),
    /** IP / session, or the literal "System" for non-human actors. */
    meta: jsonb("meta").$type<Record<string, unknown>>(),
  },
  (table) => [index("audit_events_workspace_at_idx").on(table.workspaceId, table.at)],
);


/**
 * Object metadata (R2 file/URL contract).
 *
 * Every row is tenant-scoped: org_id and workspace_id are NOT NULL, RLS is enabled
 * and FORCED, and a CHECK constraint requires object_key to begin with
 * ws/<workspace_id>/. That last one makes a row whose key belongs to another tenant
 * structurally impossible, rather than merely unlikely.
 *
 * purpose is constrained to the server-side allowlist. The list is duplicated in
 * purpose.ts by necessity (Postgres cannot read TypeScript), so
 * tests/objects-schema.test.ts reads this CHECK back out of pg_constraint and fails
 * if the two ever drift.
 *
 * size_bytes is filled in when the upload completes; it is NULL until then.
 * uploader_actor_id is text with no FK: the actors table does not exist yet (T-08),
 * so a foreign key is not yet applicable. Same shape as audit_events.actor_id.
 */
export const objects = pgTable(
  "objects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    objectKey: text("object_key").notNull().unique(),
    purpose: text("purpose").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    uploaderActorId: text("uploader_actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("objects_workspace_created_idx").on(table.workspaceId, table.createdAt)],
);
