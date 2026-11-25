import { bigint, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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


/**
 * T-08 authentication substrate.
 *
 * THE PRE-AUTH PROBLEM, and how it is solved here.
 * Magic-link redemption and session lookup happen BEFORE an actor - and therefore
 * before a tenant - is known. RLS is FORCED on every table in this schema, so a
 * policy keyed only on workspace_id would make sign-in impossible: the app could not
 * read the very row that tells it which workspace the request belongs to. Nor is
 * elevating the app role an option - that would give every query the reach that only
 * sign-in needs.
 *
 * Instead each token table carries a second, narrowly-keyed policy. The app sets a
 * transaction-local GUC from the PRESENTED credential (its hash), and the policy
 * permits exactly the rows whose hash matches. The lookup therefore returns at most
 * the one row the caller already holds the secret for, and the app learns the tenant
 * from that row rather than from caller input. The tenant policy remains, so normal
 * authenticated reads and writes are still scoped by workspace.
 *
 * The GUCs are set by the server, never by a client: `app.*` settings are only
 * readable/writable by the connecting role, and every one of them is set inside
 * src/db/client.ts's withTenant/withLookup helpers.
 */

/**
 * Workspace user identity. One row per (email, workspace); a person in two
 * workspaces has two rows, which keeps every authorization decision a single-row
 * lookup rather than a join.
 *
 * role is the docs/01 matrix identifier. "founder" is product copy for `owner` and
 * is deliberately NOT a separate role.
 *
 * email_hash exists so the pre-auth "does this address belong to a workspace?" lookup
 * can be policy-restricted without exposing the address itself to a scan.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    email: text("email").notNull(),
    emailHash: text("email_hash").notNull(),
    /** Display name for the case list, assignments and audit labels. Empty falls back to email. */
    name: text("name").notNull().default(""),
    role: text("role", {
      enum: ["owner", "approver", "workspace_admin", "request_handler", "system_owner"],
    }).notNull(),
    mfaRequired: text("mfa_required", { enum: ["true", "false"] }).notNull().default("false"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("users_workspace_id_idx").on(table.workspaceId),
    index("users_email_hash_idx").on(table.emailHash),
  ],
);

/**
 * Opaque sessions. Only the SHA-256 of the token is stored, so a database read does
 * not yield a usable credential.
 *
 * mfa_satisfied_at is what makes MFA *enforceable* rather than advisory: a session
 * exists from the moment a magic link is redeemed, but requireAuth() refuses it until
 * the TOTP step is complete for a role that requires MFA. There is no bypass flag and
 * no path that sets it without a verified TOTP code.
 *
 * privilege_epoch is incremented on privilege change; a session whose recorded epoch
 * is behind is rejected, which is how "rotate on privilege change" is enforced without
 * having to find and mutate every live session row.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    privilegeEpoch: bigint("privilege_epoch", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    mfaSatisfiedAt: timestamp("mfa_satisfied_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("sessions_workspace_id_idx").on(table.workspaceId),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

/**
 * Single-use magic links. Hashed at rest, short-lived, bound to the email that
 * requested them and to the workspace that user belongs to.
 *
 * A row is only ever created for an address that resolves to a user: an unknown
 * address gets the identical generic response and NO row, so the response cannot be
 * used to enumerate accounts. Redemption is a single atomic UPDATE ... WHERE
 * used_at IS NULL, so two concurrent redemptions cannot both succeed.
 */
export const magicLinks = pgTable(
  "magic_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    emailHash: text("email_hash").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [index("magic_links_workspace_id_idx").on(table.workspaceId)],
);

/**
 * TOTP enrolment.
 *
 * The secret is stored as AES-256-GCM ciphertext with its own IV and auth tag, never
 * in plaintext. It is never returned by an API, never logged, and never written to an
 * audit payload - the audit row for an MFA event records THAT it happened, not the
 * secret.
 *
 * last_used_step is the replay defence: a code whose time step is not strictly ahead
 * of this value is refused, so a code observed once cannot be replayed inside its
 * validity window.
 */
export const mfaTotp = pgTable(
  "mfa_totp",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    secretCiphertext: text("secret_ciphertext").notNull(),
    secretIv: text("secret_iv").notNull(),
    secretTag: text("secret_tag").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    lastUsedStep: bigint("last_used_step", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("mfa_totp_user_id_idx").on(table.userId)],
);

/**
 * DB-backed rate limiting (owner decision: not in-memory, so limits survive a restart
 * and hold across instances).
 *
 * bucket_key is a HASH of the identifying value - the email+workspace pair for
 * magic-link requests, the user id for authenticated actions, an IP hash only where
 * nothing better exists. Raw addresses are never stored here.
 *
 * workspace_id is set when the request is authenticated and NULL before sign-in, which
 * is why the tenant policy is "NULL or the current tenant": these rows carry no
 * customer data (a hash, a scope and a timestamp), and a pre-auth request must be
 * countable or sign-in could not be throttled at all.
 */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bucketKey: text("bucket_key").notNull(),
    scope: text("scope").notNull(),
    workspaceId: uuid("workspace_id"),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("rate_limit_hits_bucket_scope_at_idx").on(table.bucketKey, table.scope, table.at)],
);


/**
 * T-07 case entity (design/docs/04).
 *
 * Vocabulary is the spec's own, verbatim - CASE_STATUSES, REQUEST_TYPES and PRIORITIES
 * below are copied from docs/04's TypeScript unions, not invented. Priority has exactly
 * two values there ("Normal" | "High"), which is why there is no "Urgent".
 *
 * case_number is DSAR-{YYYY}-{5 digits} and is unique PER WORKSPACE, not globally - the
 * prototype's IDs are global, but the spec explicitly allows per-workspace.
 */
export const CASE_STATUSES = [
  "New",
  "Verifying",
  "In progress",
  "Awaiting approval",
  "Completed",
  "Extended",
  "Rejected",
] as const;

export const REQUEST_TYPES = [
  "Access",
  "Rectification",
  "Erasure",
  "Portability",
  "Objection",
  "Restriction",
] as const;

export const PRIORITIES = ["Normal", "High"] as const;

/** Risk levels (docs/04). Decided at intake; drives identity verification and escalation. */
export const RISK_LEVELS = ["Low", "Medium", "High"] as const;

/**
 * Per-workspace, per-year counter for case numbering.
 *
 * Allocation is a single INSERT ... ON CONFLICT DO UPDATE SET next_value = next_value + 1
 * RETURNING next_value (see src/server/cases/create.ts). One statement means Postgres
 * takes the row lock itself, so two concurrent creations cannot be handed the same
 * number and no application-level lock or retry loop is needed.
 */
export const caseNumberSeq = pgTable(
  "case_number_seq",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    year: integer("year").notNull(),
    nextValue: integer("next_value").notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.year] })],
);

/**
 * A DSAR case. Tenant-scoped: org_id and workspace_id are NOT NULL, RLS is enabled and
 * FORCED, and the tenant policy fails closed when app.workspace_id is unset.
 *
 * statutory_due_at is stored rather than derived: the deadline depends on the request
 * type and jurisdiction, so it is computed once at intake and kept, not recalculated on
 * read (which would silently change historical cases when the rules change).
 */
export const cases = pgTable(
  "cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    caseNumber: text("case_number").notNull(),
    requestType: text("request_type", { enum: REQUEST_TYPES }).notNull(),
    priority: text("priority", { enum: PRIORITIES }).notNull().default("Normal"),
    status: text("status", { enum: CASE_STATUSES }).notNull().default("New"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    statutoryDueAt: timestamp("statutory_due_at", { withTimezone: true }).notNull(),
    /**
     * Nullable on purpose: T-07 shipped cases before owners existed, and a NOT NULL
     * column would need a backfill with no correct value to backfill with. The list
     * renders "Unassigned"; every new case sets it at intake.
     */
    ownerId: uuid("owner_id").references(() => users.id),
    requesterName: text("requester_name").notNull().default(""),
    requesterEmail: text("requester_email").notNull().default(""),
    /** 0, 1 or 2 - the statutory extension the workspace has applied. */
    extensionMonths: smallint("extension_months").notNull().default(0),
    /** Low / Medium / High - decided at intake, drives the identity queue and dashboard. */
    risk: text("risk", { enum: RISK_LEVELS }).notNull().default("Low"),
    /** Set when the case is closed; null otherwise. The dashboard's "completed this
     *  month" and "average time to closure" both read it. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cases_workspace_number_idx").on(table.workspaceId, table.caseNumber),
    index("cases_workspace_status_idx").on(table.workspaceId, table.status),
    index("cases_workspace_received_idx").on(table.workspaceId, table.receivedAt),
    // The case list is sorted by nearest deadline; this is the index that serves it.
    index("cases_workspace_due_idx").on(table.workspaceId, table.statutoryDueAt),
  ],
);

/** Checklist row statuses - the spec's six, verbatim (docs/04). */
export const CASE_SYSTEM_STATUSES = [
  "Not started",
  "In progress",
  "Completed",
  "Not found",
  "Action required",
  "Retained under exception",
] as const;

/**
 * One data-source row per case: what the case list shows as "4 of 7".
 *
 * A row rather than a counter on `cases`: the cockpit marks each system individually and
 * the progress figure has to be derivable from those rows, or the two will disagree.
 * Tenant-scoped with the same RLS and grant pattern as every other customer table.
 */
export const caseSystems = pgTable(
  "case_systems",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    sourceKey: text("source_key").notNull(),
    /** Display name, e.g. "Production database". Stored on the row so a notification can
     *  name the system without a lookup table. */
    name: text("name").notNull().default(""),
    status: text("status", { enum: CASE_SYSTEM_STATUSES }).notNull().default("Not started"),
    evidenceCount: integer("evidence_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("case_systems_case_source_idx").on(table.caseId, table.sourceKey),
    index("case_systems_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

/**
 * Per-user notification read marks.
 *
 * Notifications themselves are DERIVED from case state on every render and never stored;
 * only the read/unread mark is persisted, keyed by `caseId + kind` per user. Marking read
 * is an idempotent INSERT (upsert); there is no DELETE because nothing here ever needs one.
 */
export const notificationReads = pgTable(
  "notification_reads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    notificationKey: text("notification_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("notification_reads_user_key_idx").on(table.userId, table.notificationKey),
    index("notification_reads_workspace_user_idx").on(table.workspaceId, table.userId),
  ],
);
