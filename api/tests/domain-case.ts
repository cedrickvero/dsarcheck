/**
 * Case fixtures for domain unit tests.
 *
 * The default is a *clean* case: every pre-closure check passes. Each test then
 * knocks out exactly the one property it is about, so a failure points at the
 * assertion rather than at the fixture.
 */
import type { CaseState, CaseSystemState, SystemStatus } from "@/domain/types";

export const NOW = new Date(Date.UTC(2026, 9, 13, 10, 42));

export const SOURCE_NAMES: Record<string, string> = {
  pg: "Production database",
  stripe: "Stripe",
  hubspot: "HubSpot",
  zendesk: "Zendesk",
  intercom: "Intercom",
  mixpanel: "Mixpanel",
  gws: "Google Workspace",
};

/** Received 24 Sep 2026, the prototype's flagship case DSAR-2026-00418. */
export const RECEIVED = new Date(Date.UTC(2026, 8, 24));

export function system(
  key: string,
  status: SystemStatus = "Completed",
  overrides: Partial<CaseSystemState> = {},
): CaseSystemState {
  return {
    key,
    status,
    outcome: null,
    evidence: status === "Completed" ? [`${key}_export_00418.json`] : [],
    reason: "",
    exceptionCategory: null,
    ...overrides,
  };
}

export function systems(): CaseSystemState[] {
  return [
    system("pg"),
    system("stripe"),
    system("hubspot"),
    system("zendesk"),
    system("intercom"),
    system("mixpanel"),
    system("gws"),
  ];
}

export function mkCase(overrides: Partial<CaseState> = {}): CaseState {
  return {
    id: "DSAR-2026-00418",
    type: "Access",
    status: "In progress",
    priority: "Normal",
    risk: "Low",
    name: "Maya Lindqvist",
    email: "maya.lindqvist@fjordmail.se",
    ident: "Customer ID C-20931",
    receivedAt: RECEIVED,
    extensionMonths: 0,
    extensionRequestedMonths: null,
    ownerName: "Priya Shah",
    approverName: "Daniel Okafor",
    emailVerification: "Confirmed",
    idMatch: "Match",
    idVerified: true,
    idDecision: { by: "Priya Shah", at: RECEIVED, reason: "Email confirmed." },
    infoRequested: false,
    template: "Access — data copy enclosed",
    redactionReview: "done",
    finalExportDone: true,
    closedAt: null,
    responseSentAt: null,
    packs: 1,
    systems: systems(),
    tokens: [],
    lastAuditAction: "",
    lastAuditReason: "",
    ...overrides,
  };
}

/**
 * `noUncheckedIndexedAccess` is on, so `list[0]` is `T | undefined`. Tests index
 * constantly; this fails loudly instead of sprinkling `!` (which would hide a
 * genuine out-of-range bug behind a non-null assertion).
 */
export function nth<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) {
    throw new Error(`nth: index ${index} is out of range (length ${list.length})`);
  }
  return value;
}
