/**
 * Demo seed — one direct org, one workspace, three users and a handful of cases, so a
 * human can sign in and see the dashboard, case list and notification bell populated.
 *
 * Idempotent: org/workspace/users are looked up by a stable key before insert, cases use
 * ON CONFLICT on (workspace_id, case_number), systems on (case_id, source_key). Run it
 * repeatedly and the result is the same.
 *
 * Run with the ADMIN DSN in the environment (same env the API container has).
 */
import crypto from "node:crypto";
import pg from "pg";

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error("seed-demo: DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function one(sql, params) {
  const r = await client.query(sql, params);
  return r.rows[0] ?? null;
}

async function ensureOrg(name, kind = "direct") {
  let row = await one(`select id from orgs where name = $1`, [name]);
  if (!row) {
    row = await one(
      `insert into orgs (name, kind) values ($1, $2) returning id`,
      [name, kind],
    );
  }
  return row.id;
}

async function ensureWorkspace(orgId, name, subdomain) {
  let row = await one(`select id from workspaces where name = $1`, [name]);
  if (!row) {
    row = await one(
      `insert into workspaces (org_id, name, subdomain) values ($1,$2,$3) returning id`,
      [orgId, name, subdomain],
    );
  }
  return row.id;
}

async function ensureUser(wsId, orgId, name, email, role) {
  const hash = sha256(email.trim().toLowerCase());
  let row = await one(`select id from users where email_hash = $1`, [hash]);
  if (!row) {
    row = await one(
      `insert into users (org_id, workspace_id, name, email, email_hash, role) values ($1,$2,$3,$4,$5,$6) returning id`,
      [orgId, wsId, name, email, hash, role],
    );
  }
  return row.id;
}

async function ensureCase(wsId, orgId, caseNumber, over) {
  const exists = await one(
    `select id from cases where workspace_id = $1 and case_number = $2`,
    [wsId, caseNumber],
  );
  if (exists) return exists.id;
  const row = await one(
    `insert into cases (org_id, workspace_id, case_number, request_type, priority, status, risk, received_at, statutory_due_at, owner_id, requester_name, requester_email, extension_months, closed_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (workspace_id, case_number) do nothing
     returning id`,
    [
      orgId, wsId, caseNumber, over.requestType, over.priority ?? "Normal",
      over.status, over.risk ?? "Low", over.receivedAt, over.dueAt,
      over.ownerId ?? null, over.requesterName, over.requesterEmail,
      over.extensionMonths ?? 0, over.closedAt ?? null,
    ],
  );
  if (row) return row.id;
  return (await one(`select id from cases where workspace_id=$1 and case_number=$2`, [wsId, caseNumber])).id;
}

async function ensureSystem(wsId, orgId, caseId, sourceKey, name, status) {
  await client.query(
    `insert into case_systems (org_id, workspace_id, case_id, source_key, name, status) values ($1,$2,$3,$4,$5,$6)
     on conflict (case_id, source_key) do update set name = excluded.name, status = excluded.status`,
    [orgId, wsId, caseId, sourceKey, name, status],
  );
}

async function ensureFile(wsId, orgId, caseId, sourceKey, name, type, sizeBytes, uploadedBy, needsRedaction) {
  await client.query(
    `insert into case_files (org_id, workspace_id, case_id, source_key, name, type, size_bytes, uploaded_by, needs_redaction)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (case_id, name, version) do nothing`,
    [orgId, wsId, caseId, sourceKey, name, type, sizeBytes, uploadedBy, needsRedaction],
  );
}

async function ensureMembership(orgId, userId, workspaceId, workspaceName, role) {
  await client.query(
    `insert into memberships (org_id, user_id, workspace_id, workspace_name, role, active)
     values ($1,$2,$3,$4,$5,true)
     on conflict (user_id, workspace_id) do update set workspace_name = excluded.workspace_name, role = excluded.role, active = true`,
    [orgId, userId, workspaceId, workspaceName, role],
  );
}

const day = (n) => new Date(Date.now() - n * 86_400_000);
const plusDays = (d, n) => new Date(d.getTime() + n * 86_400_000);

const orgId = await ensureOrg("Lumen Analytics");
const wsId = await ensureWorkspace(orgId, "Lumen Analytics", "lumen");
const priyaId = await ensureUser(wsId, orgId, "Priya Shah", "priya@lumen.io", "request_handler");
const danielId = await ensureUser(wsId, orgId, "Daniel Okafor", "daniel@lumen.io", "approver");
const saraId = await ensureUser(wsId, orgId, "Sara Lind", "sara@lumen.io", "owner");

// Live dates so the SLA indicator is meaningful against "today".
const c418 = await ensureCase(wsId, orgId, "DSAR-2026-00418", {
  requestType: "Access", status: "In progress", risk: "Low",
  receivedAt: day(19), dueAt: plusDays(day(19), 30),
  ownerId: priyaId, requesterName: "Maya Lindqvist", requesterEmail: "maya.lindqvist@fjordmail.se",
});
await ensureCase(wsId, orgId, "DSAR-2026-00405", {
  requestType: "Access", status: "In progress", risk: "Low",
  receivedAt: day(32), dueAt: plusDays(day(32), 30),
  ownerId: priyaId, requesterName: "Pablo Ortega", requesterEmail: "p.ortega@telefonica.net",
});
await ensureCase(wsId, orgId, "DSAR-2026-00412", {
  requestType: "Access", status: "Awaiting approval", risk: "Low",
  receivedAt: day(23), dueAt: plusDays(day(23), 30),
  ownerId: priyaId, requesterName: "Liisa Korhonen", requesterEmail: "liisa.korhonen@elisa.fi",
});
const c420 = await ensureCase(wsId, orgId, "DSAR-2026-00420", {
  requestType: "Erasure", status: "New", risk: "High",
  receivedAt: day(11), dueAt: plusDays(day(11), 30),
  ownerId: null, requesterName: "Grace Lin", requesterEmail: "grace.lin@fastmail.com",
});
await ensureCase(wsId, orgId, "DSAR-2026-00390", {
  requestType: "Access", status: "Completed", risk: "Low",
  receivedAt: day(34), dueAt: plusDays(day(34), 30), closedAt: day(2),
  ownerId: priyaId, requesterName: "Jonas Berg", requesterEmail: "jonas.berg@example.se",
});

// Checklist: 4 of 7 on 418.
for (const [key, name, status] of [
  ["pg", "Production database", "Completed"],
  ["stripe", "Stripe", "Completed"],
  ["hubspot", "HubSpot", "Not found"],
  ["zendesk", "Zendesk", "Completed"],
  ["intercom", "Intercom", "In progress"],
  ["mixpanel", "Mixpanel", "Not started"],
  ["gws", "Google Workspace", "Not started"],
]) {
  await ensureSystem(wsId, orgId, c418, key, name, status);
}
// One Action-required system on the erasure case -> "System needs action" notification.
await ensureSystem(wsId, orgId, c420, "pg", "Production database", "Action required");

// Redaction demo on 418: one Zendesk file + 5 tokens (4 flagged), as in the prototype.
await ensureFile(wsId, orgId, c418, "Zendesk", "zendesk_tickets_00418.pdf", "PDF", 184000, priyaId, true);
const tokenCount = await one(`select count(*)::int as n from redaction_tokens where case_id = $1`, [c418]);
if (tokenCount.n === 0) {
  const zendeskFileId = (await one(
    `select id from case_files where case_id = $1 and name = $2`,
    [c418, "zendesk_tickets_00418.pdf"],
  )).id;
  for (const [category, snippet, flagged] of [
    ["Third-party personal data", "Erik…", true],
    ["Phone number", "+46 …", true],
    ["Email", "erik…", true],
    ["Name", "Tom …", false],
    ["Confidential free-text note", "Cust…", true],
  ]) {
    await client.query(
      `insert into redaction_tokens (org_id, workspace_id, case_id, file_id, category, snippet, flagged, redacted)
       values ($1,$2,$3,$4,$5,$6,$7,false)`,
      [orgId, wsId, c418, zendeskFileId, category, snippet, flagged],
    );
  }
}

// ── Agency org (Northlight Privacy) + client workspaces + memberships ──
const northOrgId = await ensureOrg("Northlight Privacy", "agency");
const northRootWsId = await ensureWorkspace(northOrgId, "Northlight Privacy", "northlight");
const kestoWsId = await ensureWorkspace(northOrgId, "Kesto Health", "kesto-health");
const fernwoodWsId = await ensureWorkspace(northOrgId, "Fernwood & Co", "fernwood");
const maraId = await ensureUser(northRootWsId, northOrgId, "Mara Voss", "mara@northlight.io", "owner");
// Mara (agency owner) is a member of both client workspaces.
await ensureMembership(northOrgId, maraId, kestoWsId, "Kesto Health", "owner");
await ensureMembership(northOrgId, maraId, fernwoodWsId, "Fernwood & Co", "owner");

// A couple of cases per client so the agency KPIs have data.
const kestoCase = await ensureCase(kestoWsId, northOrgId, "DSAR-2026-00061", {
  requestType: "Access", status: "Awaiting approval", risk: "Low",
  receivedAt: day(46), dueAt: plusDays(day(46), 30),
  ownerId: maraId, requesterName: "Liisa Korhonen", requesterEmail: "liisa.korhonen@elisa.fi",
});
await ensureSystem(kestoWsId, northOrgId, kestoCase, "pg", "Production database", "Completed");
const fernwoodCase = await ensureCase(fernwoodWsId, northOrgId, "DSAR-2026-00117", {
  requestType: "Access", status: "In progress", risk: "Low",
  receivedAt: day(40), dueAt: plusDays(day(40), 30),
  ownerId: maraId, requesterName: "Ruth Abernathy", requesterEmail: "ruth.a@btinternet.com",
});
await ensureSystem(fernwoodWsId, northOrgId, fernwoodCase, "mixpanel", "Mixpanel", "Action required");
const fernwoodHigh = await ensureCase(fernwoodWsId, northOrgId, "DSAR-2026-00119", {
  requestType: "Erasure", status: "Verifying", risk: "High",
  receivedAt: day(12), dueAt: plusDays(day(12), 30),
  ownerId: null, requesterName: "Pablo Ortega", requesterEmail: "p.ortega@telefonica.net",
});

console.log("Seed complete.");
console.log("  Sign-in user: priya@lumen.io (Request handler)");
console.log("  Also: daniel@lumen.io (Approver), sara@lumen.io (Owner)");
console.log("  Workspace: Lumen Analytics");

await client.end();
