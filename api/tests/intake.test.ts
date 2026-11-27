/**
 * Public intake (docs/03 § H): field validation, case creation with requester details and the
 * "Request received via intake form" audit (actor System), and portal host resolution.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { systemDb } from "@/db/client";
import { auditEvents, caseFiles, cases, orgs, workspaces } from "@/db/schema";
import { resolvePortalByHost, portalSlug, type ResolvedPortal } from "@/server/portal/resolve";
import { submitIntake, validateIntake } from "@/server/portal/intake";
import { storeIntakeAttachments, validateAttachments } from "@/server/portal/attachments";
import { classifyHost } from "@/domain/host";

const RUN = `${Date.now()}`;
const tag = `intake${RUN}`; // valid slug: lowercase letters + digits

let orgId = "";
let wsId = "";
let portal: ResolvedPortal;

beforeAll(async () => {
  orgId = (await systemDb.insert(orgs).values({ name: `${tag}-org`, kind: "direct" }).returning({ id: orgs.id }))[0]!.id;
  wsId = (await systemDb.insert(workspaces).values({ orgId, name: `${tag}-ws`, subdomain: tag }).returning({ id: workspaces.id }))[0]!.id;
  portal = { orgId, workspaceId: wsId, name: `${tag}-ws`, subdomain: tag };
});

describe("validateIntake", () => {
  it("returns no errors for a complete submission", () => {
    expect(
      validateIntake({ type: "Access", name: "Ada Lovelace", email: "ada@example.com", identKind: "Customer ID", ident: "C-1", details: "Please send my data.", consent: "on", human: "on" }),
    ).toEqual({});
  });

  it("returns the verbatim field errors for an empty form", () => {
    const e = validateIntake({ type: "Access", name: "", email: "", identKind: "Customer ID", ident: "", details: "", consent: "", human: "" });
    expect(e.name).toBe("Enter your full name.");
    expect(e.email).toBe("Enter a valid email address, like name@example.com.");
    expect(e.ident).toBe("Enter an identifier so we can find your account.");
    expect(e.details).toBe("Describe your request.");
    expect(e.consent).toBe("You must agree before we can process your request.");
    expect(e.human).toBe("Complete the anti-spam check.");
  });
});

describe("submitIntake", () => {
  it("creates a New case with requester details and the intake audit (actor System)", async () => {
    const result = await submitIntake(portal, {
      type: "Erasure",
      name: "Ada Lovelace",
      email: `ada-${RUN}@example.com`,
      identKind: "Customer ID",
      ident: "C-123",
      details: "Please delete my account.",
      consent: "on",
      human: "on",
    }, "http://example.test");
    expect(result.caseNumber).toMatch(/^DSAR-\d{4}-\d{5}$/);

    const [row] = await systemDb
      .select()
      .from(cases)
      .where(and(eq(cases.caseNumber, result.caseNumber), eq(cases.workspaceId, wsId)));
    expect(row).toBeTruthy();
    expect(row!.workspaceId).toBe(wsId);
    expect(row!.requestType).toBe("Erasure");
    expect(row!.status).toBe("New");
    expect(row!.requesterName).toBe("Ada Lovelace");
    expect(row!.requesterEmail).toBe(`ada-${RUN}@example.com`);
    expect(row!.identifier).toBe("Customer ID C-123");
    expect(row!.details).toBe("Please delete my account.");

    const [audit] = await systemDb.select().from(auditEvents).where(eq(auditEvents.objectId, row!.id));
    expect(audit!.action).toBe("Request received via intake form");
    expect(audit!.category).toBe("Intake");
    expect(audit!.actorLabel).toBe("System");
  });
});

describe("resolvePortalByHost", () => {
  it("resolves a portal host to its workspace", async () => {
    const resolved = await resolvePortalByHost(`${tag}.dsarcheck.com`);
    expect(resolved).not.toBeNull();
    expect(resolved!.workspaceId).toBe(wsId);
    expect(resolved!.orgId).toBe(orgId);
  });

  it("returns null for an unknown subdomain (fail closed, no enumeration)", async () => {
    expect(await resolvePortalByHost(`nope${RUN}.dsarcheck.com`)).toBeNull();
  });

  it("returns null for the apex (not a portal)", async () => {
    expect(await resolvePortalByHost("dsarcheck.com")).toBeNull();
  });
});

describe("portalSlug (the tenant discriminator)", () => {
  it("yields the slug only for a portal surface", () => {
    expect(portalSlug(classifyHost("lumen.dsarcheck.com"))).toBe("lumen");
    expect(portalSlug(classifyHost("dsarcheck.com"))).toBeNull();
    expect(portalSlug(classifyHost("admin.dsarcheck.com"))).toBeNull();
    expect(portalSlug(classifyHost("www.dsarcheck.com"))).toBeNull();
  });
});

describe("intake hardening", () => {
  it("whitelists the identifier kind, falling back to Customer ID", async () => {
    const result = await submitIntake(portal, {
      type: "Access", name: "Ada", email: `ada2-${RUN}@example.com`, identKind: "Hacked", ident: "X-9", details: "data please", consent: "on", human: "on",
    }, "http://example.test");
    const [row] = await systemDb
      .select({ identifier: cases.identifier })
      .from(cases)
      .where(and(eq(cases.caseNumber, result.caseNumber), eq(cases.workspaceId, wsId)));
    expect(row!.identifier).toBe("Customer ID X-9");
  });

  it("enforces subdomain uniqueness at the database (no two workspaces share a subdomain)", async () => {
    await expect(systemDb.insert(workspaces).values({ orgId, name: `${tag}-dup`, subdomain: tag })).rejects.toThrow();
  });
});

describe("intake attachments (G14)", () => {
  it("validateAttachments rejects count, size and type violations with their copy", () => {
    expect(validateAttachments([{ name: "a.pdf", type: "application/pdf", size: 10 }])).toBeNull();
    const six = Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.pdf`, type: "application/pdf", size: 10 }));
    expect(validateAttachments(six)).toBe("Attach up to 5 files.");
    expect(validateAttachments([{ name: "big.pdf", type: "application/pdf", size: 10 * 1024 * 1024 + 1 }])).toBe(
      "big.pdf is larger than 10 MB.",
    );
    expect(validateAttachments([{ name: "x.exe", type: "application/octet-stream", size: 10 }])).toBe(
      "x.exe is not a PDF, JPG or PNG.",
    );
  });

  it("accepts a file by extension when the browser omits its MIME type", () => {
    expect(validateAttachments([{ name: "photo.png", type: "", size: 10 }])).toBeNull();
  });

  it("storeIntakeAttachments PUTs each file and returns tenant-scoped metadata", async () => {
    const puts: { key: string; type: string; body: Uint8Array }[] = [];
    const bytes = new TextEncoder().encode("hello");
    const stored = await storeIntakeAttachments(
      wsId,
      "case-1",
      [{ name: "a.pdf", type: "application/pdf", size: 5, bytes }],
      async (key, type, body) => {
        puts.push({ key, type, body });
      },
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]!.name).toBe("a.pdf");
    expect(stored[0]!.storageKey).toMatch(new RegExp(`^intake/${wsId}/case-1/`));
    expect(stored[0]!.sha256).toHaveLength(64);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.key).toBe(stored[0]!.storageKey);
    expect(puts[0]!.body).toEqual(bytes);
  });

  it("submitIntake records a case_files row per attachment (injected put)", async () => {
    const bytes = new TextEncoder().encode("pdf bytes");
    const email = `att-${RUN}@example.com`;
    const result = await submitIntake(
      portal,
      { type: "Access", name: "Ada", email, identKind: "Customer ID", ident: "C-1", details: "data", consent: "on", human: "on" },
      "http://example.test",
      [{ name: "a.pdf", type: "application/pdf", size: bytes.length, bytes }],
      async () => {},
    );
    const [c] = await systemDb
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.caseNumber, result.caseNumber), eq(cases.workspaceId, wsId)));
    const files = await systemDb.select().from(caseFiles).where(eq(caseFiles.caseId, c!.id));
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe("a.pdf");
    expect(files[0]!.workspaceId).toBe(wsId);
    expect(files[0]!.isEvidence).toBe(false);
    expect(files[0]!.uploadedBy).toBeNull();
    expect(files[0]!.sha256).toHaveLength(64);
  });
});

describe("duplicate-open-case warning (G14)", () => {
  it("returns the existing open case number when the same email already has one", async () => {
    const email = `dup-${RUN}@example.com`;
    const base = { type: "Access", name: "Ada", identKind: "Customer ID", ident: "C-1", details: "data", consent: "on", human: "on" };
    const first = await submitIntake(portal, { ...base, email }, "http://example.test");
    const second = await submitIntake(portal, { ...base, email }, "http://example.test");
    expect(first.duplicateCaseNumber).toBeNull();
    expect(second.duplicateCaseNumber).toBe(first.caseNumber);
  });

  it("matches the email case-insensitively", async () => {
    const email = `Case-${RUN}@example.com`;
    const base = { type: "Access", name: "Ada", identKind: "Customer ID", ident: "C-1", details: "data", consent: "on", human: "on" };
    const first = await submitIntake(portal, { ...base, email }, "http://example.test");
    const second = await submitIntake(portal, { ...base, email: email.toUpperCase() }, "http://example.test");
    expect(second.duplicateCaseNumber).toBe(first.caseNumber);
  });

  it("does not flag a Closed (Completed/Rejected) case as a duplicate", async () => {
    const email = `done-${RUN}@example.com`;
    const base = { type: "Access", name: "Ada", identKind: "Customer ID", ident: "C-1", details: "data", consent: "on", human: "on" };
    const first = await submitIntake(portal, { ...base, email }, "http://example.test");
    await systemDb
      .update(cases)
      .set({ status: "Completed" })
      .where(and(eq(cases.caseNumber, first.caseNumber), eq(cases.workspaceId, wsId)));
    const second = await submitIntake(portal, { ...base, email }, "http://example.test");
    expect(second.duplicateCaseNumber).toBeNull();
  });
});
