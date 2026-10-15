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
