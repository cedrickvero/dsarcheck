/**
 * Pre-closure checks — ported verbatim from `checks()` in
 * `design/reference/seed/workspace-seed.js`, documented in docs/05 § Pre-closure
 * checks.
 *
 * Six checks, six distinct gates. The wording of every `detail` is final copy and
 * the target `tab` is what the cockpit's "Remaining" list links to.
 *
 * Erasure and non-erasure cases diverge on check 4: an erasure case needs its
 * outcomes resolved, anything else needs redaction reviewed and exported.
 */
import type { CaseState, CaseSystemState } from "./types";

export type PreClosureCheckId =
  | "id"
  | "sys"
  | "ev"
  | "er"
  | "red"
  | "tpl"
  | "exc";

export interface PreClosureCheck {
  id: PreClosureCheckId;
  label: string;
  satisfied: boolean;
  detail: string;
  /** Cockpit tab the item links to. */
  tab: string;
}

export interface PreClosureChecks {
  items: PreClosureCheck[];
  /** Convenience flags — each is the corresponding item's `satisfied`. */
  identityVerified: boolean;
  allSystemsSearched: boolean;
  evidenceAttached: boolean;
  workResolved: boolean;
  templateSelected: boolean;
  exceptionsDocumented: boolean;
  /** Every check passes: send-for-approval and approve-and-close are permitted. */
  allPass: boolean;
  /** The failing items, in order. The cockpit shows "N items remain". */
  blockers: PreClosureCheck[];
}

const OPEN_STATUSES = new Set(["Not started", "In progress"]);

/** Systems whose status means the search has not concluded. */
function openSystems(systems: CaseSystemState[], isErasure: boolean): CaseSystemState[] {
  return systems.filter(
    (s) =>
      OPEN_STATUSES.has(s.status) ||
      // A non-erasure case also counts Action required as unfinished: the
      // handler has to resolve it before approval. Erasure has its own check.
      (!isErasure && s.status === "Action required"),
  );
}

export function checks(
  input: Pick<CaseState, "type" | "idVerified" | "systems" | "tokens" | "template" | "redactionReview" | "finalExportDone" | "ownerName" | "idDecision">,
): PreClosureChecks {
  const isErasure = input.type === "Erasure";
  const systems = input.systems;

  const open = openSystems(systems, isErasure);
  const needEvidence = systems.filter(
    (s) =>
      (s.status === "Completed" || s.status === "Retained under exception") &&
      s.evidence.length === 0,
  );
  const actionRequired = systems.filter((s) => s.status === "Action required");
  const retained = systems.filter((s) => s.status === "Retained under exception");
  const unredacted = input.tokens.filter((t) => t.flagged && !t.redacted).length;

  const items: PreClosureCheck[] = [
    {
      id: "id",
      label: "Identity verified",
      satisfied: input.idVerified,
      detail: input.idVerified
        ? `Decision recorded by ${input.idDecision ? input.idDecision.by : input.ownerName}`
        : "Identity decision pending",
      tab: "identity",
    },
    {
      id: "sys",
      label: "All systems searched",
      satisfied: open.length === 0,
      detail:
        open.length > 0
          ? `${open.length} of ${systems.length} systems still open`
          : `${systems.length} of ${systems.length} systems searched`,
      tab: "checklist",
    },
    {
      id: "ev",
      label: "Evidence attached",
      satisfied: needEvidence.length === 0,
      detail:
        needEvidence.length > 0
          ? `${needEvidence.length} systems missing evidence`
          : "Evidence on every completed system",
      tab: "checklist",
    },
  ];

  if (isErasure) {
    items.push({
      id: "er",
      label: "Erasure outcomes resolved",
      satisfied: actionRequired.length === 0 && open.length === 0,
      detail:
        actionRequired.length > 0
          ? `${actionRequired.length} ${actionRequired.length === 1 ? "system requires" : "systems require"} action`
          : open.length > 0
            ? "Outcomes not yet recorded"
            : "No systems in Action required",
      tab: "work",
    });
  } else {
    items.push({
      id: "red",
      label: "Redaction reviewed",
      satisfied:
        input.tokens.length === 0 ||
        (unredacted === 0 && input.redactionReview === "done" && input.finalExportDone),
      detail:
        input.tokens.length === 0
          ? "No files require redaction"
          : unredacted > 0
            ? `${unredacted} flagged items not yet redacted`
            : input.redactionReview !== "done"
              ? input.redactionReview === "requested"
                ? "Review requested, not completed"
                : "Review not requested"
              : !input.finalExportDone
                ? "Final redacted export not generated"
                : "Reviewed and exported",
      tab: "work",
    });
  }

  items.push({
    id: "tpl",
    label: "Response template selected",
    satisfied: Boolean(input.template),
    detail: input.template || "No template selected",
    tab: "approval",
  });

  items.push({
    id: "exc",
    label: "Exceptions documented",
    satisfied: retained.every((s) => Boolean(s.reason) && Boolean(s.exceptionCategory)),
    detail:
      retained.length > 0
        ? `${retained.length} retention exception${retained.length > 1 ? "s" : ""} with reason`
        : "No exceptions recorded",
    tab: isErasure ? "work" : "checklist",
  });

  const byId = (id: PreClosureCheckId) =>
    items.find((item) => item.id === id)?.satisfied ?? false;

  // Erasure resolves the work through check "er"; others through "red".
  const workResolved = isErasure ? byId("er") : byId("red");
  const blockers = items.filter((item) => !item.satisfied);

  return {
    items,
    identityVerified: byId("id"),
    allSystemsSearched: byId("sys"),
    evidenceAttached: byId("ev"),
    workResolved,
    templateSelected: byId("tpl"),
    exceptionsDocumented: byId("exc"),
    allPass: blockers.length === 0,
    blockers,
  };
}

/** "N item(s) remain" — the disabled-CTA note. */
export function remainingLabel(count: number): string {
  return `${count} ${count === 1 ? "item remains" : "items remain"}`;
}
