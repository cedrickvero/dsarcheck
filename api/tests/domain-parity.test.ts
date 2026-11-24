/**
 * Parity with the design reference.
 *
 * `AGENTS.md` says the handoff is the source of truth, and the domain port claims to be
 * verbatim. This suite proves it: it loads the ORIGINAL `workspace-seed.js`, runs its
 * `sla()`, `progress()`, `checks()` and `respText()` over every case the reference itself
 * seeds, and requires our output to match field for field.
 *
 * If the design package is updated, this test fails rather than letting the port and the
 * prototype drift apart.
 *
 * The reference computes dates with local-time getters, so this suite is only meaningful
 * when the process runs in UTC (asserted below, not assumed).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseIsoDate } from "@/domain/dates";
import { sla } from "@/domain/sla";
import { checks } from "@/domain/checks";
import { progress } from "@/domain/progress";
import { respText } from "@/domain/respText";
import { checkSub } from "@/domain/subdomain";
import { DEFAULT_PLATFORM_DOMAIN } from "@/domain/platform";
import type { CaseState, CaseStatus, CaseSystemState, RequestType } from "@/domain/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2 Oct` -> 2026-10-02. Every seeded date is in 2026. */
function parseShortDate(text: string): Date {
  const [day, month] = text.split(" ");
  const index = MONTHS.indexOf(month ?? "");
  if (index < 0) throw new Error(`parseShortDate: bad month in "${text}"`);
  return new Date(Date.UTC(2026, index, Number(day)));
}

interface RefSystem {
  key: string;
  status: string;
  evidence: string[];
  outcome: string | null;
  reason: string;
  exCat: string;
}

interface RefCase {
  id: string;
  type: string;
  status: string;
  priority: string;
  risk: string;
  name: string;
  email: string;
  ident: string;
  received: string;
  extMonths: number;
  owner: string;
  approver?: string;
  emailV: string;
  idMatch: string;
  idMatchNote?: string;
  idVerified: boolean;
  idDecision: { by: string } | null;
  infoRequested: boolean;
  template: string;
  redReview: "none" | "requested" | "done";
  exportDone: boolean;
  closed: string;
  systems: RefSystem[];
  tokens: { flag: boolean; red: boolean }[];
}

interface RefModule {
  NOW: Date;
  seed: () => RefCase[];
  sla: (c: RefCase) => Record<string, unknown>;
  progress: (c: RefCase) => Record<string, unknown>;
  checks: (c: RefCase) => Record<string, unknown>[];
  respText: (c: RefCase, client: { sender: string }) => string;
  SYS: { key: string; name: string }[];
  TEMPLATES: string[];
  CLIENTS: { key: string; sender: string }[];
}

const here = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(here, "..", "..", "design", "reference", "seed", "workspace-seed.js");

async function loadReference(): Promise<RefModule> {
  const source = readFileSync(SEED_PATH, "utf8");
  // A data URL keeps the reference file untouched and needs no package.json in design/.
  return (await import(
    `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`
  )) as unknown as RefModule;
}

const ref = await loadReference();
const S = ref.SYS.map((s) => ({ key: s.key, name: s.name }));
const CASES = ref.seed();

/**
 * The seeded cases do not reach every branch: every seeded Completed system has evidence,
 * and no seeded case is missing a template. These synthetic cases are built in the
 * reference's own shape so the SAME reference code can be asked about them - otherwise
 * "parity" would only prove parity where the demo data happens to go.
 */
function refCase(over: Partial<RefCase> & { id: string }): RefCase {
  const base: RefCase = {
    id: over.id,
    type: "Access",
    status: "In progress",
    priority: "Normal",
    risk: "Low",
    name: "Test Person",
    email: "test.person@example.com",
    ident: "Customer ID C-1",
    received: "2026-09-24",
    extMonths: 0,
    owner: "Priya Shah",
    emailV: "Confirmed",
    idMatch: "Match",
    idVerified: true,
    idDecision: null,
    infoRequested: false,
    template: "Access — data copy enclosed",
    redReview: "none",
    exportDone: false,
    closed: "",
    systems: [],
    tokens: [],
  };
  const systems = ref.SYS.map((s) => ({
    key: s.key,
    status: "Completed",
    evidence: [`${s.key}_export.json`],
    outcome: null,
    reason: "",
    exCat: "",
  }));
  return { ...base, ...over, systems: over.systems ?? systems, tokens: over.tokens ?? [] };
}

const ALL = [
  ...CASES,
  refCase({
    id: "SYNTH-NO-EVIDENCE",
    systems: ref.SYS.map((s) => ({
      key: s.key,
      status: "Completed",
      evidence: [],
      outcome: null,
      reason: "",
      exCat: "",
    })),
  }),
  refCase({
    id: "SYNTH-UNREDACTED",
    tokens: [
      { flag: true, red: false },
      { flag: true, red: false },
    ],
  }),
  refCase({ id: "SYNTH-REVIEW-REQUESTED", redReview: "requested", tokens: [{ flag: true, red: true }] }),
  refCase({ id: "SYNTH-NOT-EXPORTED", redReview: "done", exportDone: false, tokens: [{ flag: true, red: true }] }),
  refCase({ id: "SYNTH-NO-TEMPLATE", template: "" }),
  refCase({
    id: "SYNTH-RETAINED-NO-CATEGORY",
    systems: ref.SYS.map((s) =>
      s.key === "stripe"
        ? {
            key: s.key,
            status: "Retained under exception",
            evidence: ["stripe.pdf"],
            outcome: null,
            reason: "Statutory accounting.",
            exCat: "",
          }
        : { key: s.key, status: "Completed", evidence: ["x.json"], outcome: null, reason: "", exCat: "" },
    ),
  }),
  refCase({
    id: "SYNTH-ERASURE-ACTION",
    type: "Erasure",
    systems: ref.SYS.map((s) =>
      s.key === "pg"
        ? { key: s.key, status: "Action required", evidence: [], outcome: "Action required", reason: "", exCat: "" }
        : { key: s.key, status: "Completed", evidence: ["x.json"], outcome: "Deleted", reason: "", exCat: "" },
    ),
  }),
  refCase({ id: "SYNTH-ACCESS-ACTION", systems: ref.SYS.map((s) => (s.key === "pg" ? { key: s.key, status: "Action required", evidence: [], outcome: null, reason: "", exCat: "" } : { key: s.key, status: "Completed", evidence: ["x.json"], outcome: null, reason: "", exCat: "" })) }),
  refCase({ id: "SYNTH-OVERDUE", received: "2026-09-01" }),
  refCase({ id: "SYNTH-EXTENDED", received: "2026-09-05", extMonths: 2, status: "Extended" }),
  refCase({ id: "SYNTH-CLOSED", status: "Completed", closed: "2 Oct" }),
];

function toCaseState(c: RefCase): CaseState {
  return {
    id: c.id,
    type: c.type as RequestType,
    status: c.status as CaseStatus,
    priority: c.priority as CaseState["priority"],
    risk: c.risk as CaseState["risk"],
    name: c.name,
    email: c.email,
    ident: c.ident,
    receivedAt: parseIsoDate(c.received),
    extensionMonths: (c.extMonths ?? 0) as 0 | 1 | 2,
    ownerName: c.owner,
    approverName: c.approver,
    emailVerification: c.emailV as CaseState["emailVerification"],
    idMatch: c.idMatch as CaseState["idMatch"],
    idMatchNote: c.idMatchNote,
    idVerified: c.idVerified,
    idDecision: c.idDecision
      ? { by: c.idDecision.by, at: new Date(0), reason: "" }
      : null,
    infoRequested: c.infoRequested,
    template: c.template || null,
    redactionReview: c.redReview,
    finalExportDone: c.exportDone,
    closedAt: c.closed ? parseShortDate(c.closed) : null,
    packs: 0,
    systems: c.systems.map(
      (s): CaseSystemState => ({
        key: s.key,
        status: s.status as CaseSystemState["status"],
        outcome: (s.outcome as CaseSystemState["outcome"]) ?? null,
        evidence: s.evidence,
        reason: s.reason,
        exceptionCategory: (s.exCat as CaseSystemState["exceptionCategory"]) || null,
      }),
    ),
    tokens: c.tokens.map((t) => ({ flagged: t.flag, redacted: t.red })),
  };
}

describe("the reference and this port run in the same timezone", () => {
  it("is UTC, which is what makes the date comparisons meaningful", () => {
    expect(new Date(2026, 9, 13).getTimezoneOffset()).toBe(0);
    expect(ref.NOW.toISOString()).toBe("2026-10-13T00:00:00.000Z");
  });
});

describe("sla() parity", () => {
  it.each(ALL.map((c) => [c.id, c] as const))("%s", (id, c) => {
    const expected = ref.sla(c);
    const actual = sla({
      status: c.status as CaseStatus,
      receivedAt: parseIsoDate(c.received),
      extensionMonths: (c.extMonths ?? 0) as 0 | 1 | 2,
      closedAt: c.closed ? parseShortDate(c.closed) : null,
      now: ref.NOW,
    });

    expect(actual.label, `${id} label`).toBe(expected.label);
    expect(actual.risk, `${id} risk`).toBe(expected.risk);
    expect(actual.pct, `${id} pct`).toBe(expected.pct);
    expect(actual.daysLeft, `${id} days left`).toBe(expected.left);
    expect(actual.deadline, `${id} deadline`).toBe(expected.deadline);
    // The reference omits `deadlineS` on closed cases; we always return a string so the
    // UI can never render `undefined`. Compare only when the reference defines it.
    if (expected.deadlineS !== undefined) {
      expect(actual.deadlineShort, `${id} deadline short`).toBe(expected.deadlineS);
    } else {
      expect(actual.deadlineShort, `${id} deadline short (ours is always a string)`).toBe("—");
    }
    expect(actual.open, `${id} open`).toBe(expected.open);
    expect(`icon-${actual.icon}`, `${id} icon`).toBe(expected.icon);
    expect(actual.fg, `${id} fg`).toBe(expected.fg);
    expect(actual.bg, `${id} bg`).toBe(expected.bg);
    expect(actual.bar, `${id} bar`).toBe(expected.bar);
  });

  it("covers every branch of the indicator", () => {
    const labels = ALL.map((c) => String(ref.sla(c).label));
    expect(labels.some((l) => l === "Due today")).toBe(true);
    expect(labels.some((l) => l.startsWith("Overdue by"))).toBe(true);
    expect(labels.some((l) => l.endsWith("days left"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Closed"))).toBe(true);
  });
});

describe("progress() parity", () => {
  it.each(ALL.map((c) => [c.id, c] as const))("%s", (id, c) => {
    const expected = ref.progress(c);
    const actual = progress(toCaseState(c).systems);
    expect(actual, id).toEqual({
      done: expected.done,
      total: expected.total,
      label: expected.label,
      pct: expected.pct,
    });
  });
});

describe("checks() parity", () => {
  it.each(ALL.map((c) => [c.id, c] as const))("%s", (id, c) => {
    const expected = ref.checks(c);
    const actual = checks(toCaseState(c)).items;

    expect(actual.length, `${id} item count`).toBe(expected.length);
    expected.forEach((item, i) => {
      const mine = actual[i];
      expect(mine, `${id} item ${i} exists`).toBeDefined();
      expect(mine?.id, `${id} item ${i} id`).toBe(item.k);
      expect(mine?.label, `${id} item ${i} label`).toBe(item.label);
      expect(mine?.satisfied, `${id} item ${i} satisfied`).toBe(item.ok);
      expect(mine?.detail, `${id} item ${i} detail`).toBe(item.detail);
      expect(mine?.tab, `${id} item ${i} tab`).toBe(item.tab);
    });
  });

  it("exercises both the erasure and the access branches, with failures in each", () => {
    const erasure = CASES.filter((c) => c.type === "Erasure");
    const access = CASES.filter((c) => c.type !== "Erasure");
    expect(erasure.length).toBeGreaterThan(0);
    expect(access.length).toBeGreaterThan(0);
    expect(erasure.some((c) => ref.checks(c).some((i) => i.id === undefined && i.k === "er"))).toBe(true);
    expect(access.some((c) => ref.checks(c).some((i) => i.k === "red"))).toBe(true);
    expect(CASES.some((c) => ref.checks(c).some((i) => i.ok === false))).toBe(true);
    expect(CASES.some((c) => ref.checks(c).every((i) => i.ok === true))).toBe(true);
  });
});

describe("respText() parity", () => {
  const templates = ["", ...ref.TEMPLATES];

  it.each(ALL.flatMap((c) => templates.map((t) => [`${c.id} / ${t || "(none)"}`, c, t] as const)))(
    "%s",
    (_label, c, template) => {
      const client = ref.CLIENTS.find((cl) => cl.key === (c as RefCase & { client: string }).client);
      const sender = client?.sender ?? "Lumen Analytics Privacy";
      const expected = ref.respText({ ...c, template }, { sender });
      const actual = respText(
        {
          id: c.id,
          name: c.name,
          type: c.type,
          receivedAt: parseIsoDate(c.received),
          template,
          systems: c.systems.map((s) => ({
            key: s.key,
            outcome: (s.outcome as CaseSystemState["outcome"]) ?? null,
          })),
        },
        { sender },
        S,
      );
      expect(actual).toBe(expected);
    },
  );

  it("covers every outcome group and the refusal branch", () => {
    const erasureTemplate = ref.TEMPLATES[1] ?? "";
    const refusalTemplate = ref.TEMPLATES[5] ?? "";
    const erasureTexts = CASES.map((c) => ref.respText({ ...c, template: erasureTemplate }, { sender: "X" }));
    expect(erasureTexts.some((t) => t.includes("• Deleted:"))).toBe(true);
    expect(erasureTexts.some((t) => t.includes("• No data found:"))).toBe(true);
    expect(erasureTexts.some((t) => t.includes("• Retained under legal obligation:"))).toBe(true);

    const refusalTexts = CASES.map((c) => ref.respText({ ...c, template: refusalTemplate }, { sender: "X" }));
    expect(refusalTexts.every((t) => t.includes("[Documented reason]"))).toBe(true);
  });
});

describe("copy that cannot be parity-tested dynamically", () => {
  /**
   * `checkSub()` lives on a prototype class that needs a live component to instantiate,
   * so its copy is checked the other way round: every literal fragment we emit must also
   * appear in `workspace-direct-logic.js`.
   */
  it("uses the reference's subdomain copy verbatim", () => {
    const source = readFileSync(
      join(here, "..", "..", "design", "reference", "logic", "workspace-direct-logic.js"),
      "utf8",
    );
    const emitted = [
      checkSub("ab", "lumen.io").message,
      checkSub("google", "lumen.io").message,
      checkSub("acme", "lumen.io", { taken: ["acme"] }).message,
      checkSub("acme", "lumen.io").message,
    ].join(" | ");

    // The reference was written for privacyspace.com; the product ships as dsarcheck.com.
    // Normalising the domain is the ONLY permitted difference in this copy, and it is
    // recorded in docs/08 as a deliberate brand substitution.
    const normalisedSource = source.split("privacyspace.com").join(DEFAULT_PLATFORM_DOMAIN);

    const fragments = [
      "Use 3–30 lowercase letters, numbers or hyphens. It can’t start or end with a hyphen.",
      " is reserved. Brand and system names are protected and can’t be claimed.",
      `.${DEFAULT_PLATFORM_DOMAIN} is already in use.`,
      "doesn’t match your verified domain (",
      "so a person checks it before it’s released. This usually takes one business day.",
    ];

    for (const fragment of fragments) {
      expect(normalisedSource.includes(fragment), `fragment missing from the reference: ${fragment}`).toBe(
        true,
      );
      expect(emitted, `fragment missing from our copy: ${fragment}`).toContain(fragment);
    }
  });
});
