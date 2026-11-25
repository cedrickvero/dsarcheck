export type CockpitTab =
  | "overview"
  | "identity"
  | "checklist"
  | "collection"
  | "approval"
  | "evidence"
  | "audit";

export const COCKPIT_TABS: readonly CockpitTab[] = [
  "overview",
  "identity",
  "checklist",
  "collection",
  "approval",
  "evidence",
  "audit",
];

/** The ?tab= decision, extracted so it is testable: a known tab passes through, anything
 *  else (unknown, missing, array) falls back to overview. */
export function resolveCockpitTab(raw: string | undefined): CockpitTab {
  return raw !== undefined && COCKPIT_TABS.includes(raw as CockpitTab)
    ? (raw as CockpitTab)
    : "overview";
}

/** The tab bar. Links (not buttons) so middle-click and back/forward work, and the active
 *  tab is in the URL per docs/03. */
export function CockpitTabs(props: {
  active: CockpitTab;
  requestType: string;
  systemsDone: number;
  systemsTotal: number;
}) {
  const collectionLabel = props.requestType === "Erasure" ? "Erasure outcomes" : "Collection & redaction";
  const tabs: { id: CockpitTab; label: string; badge?: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "identity", label: "Identity" },
    {
      id: "checklist",
      label: "Data-source checklist",
      badge: `${props.systemsDone}/${props.systemsTotal}`,
    },
    { id: "collection", label: collectionLabel },
    { id: "approval", label: "Approval & response" },
    { id: "evidence", label: "Evidence pack" },
    { id: "audit", label: "Audit log" },
  ];

  return (
    <nav className="cockpit-tabs" role="tablist" aria-label="Case sections">
      {tabs.map((t) => (
        <a
          key={t.id}
          role="tab"
          aria-selected={props.active === t.id}
          href={`?tab=${t.id}`}
          className={props.active === t.id ? "is-active" : undefined}
        >
          {t.label}
          {t.badge ? <span className="tab-badge">{t.badge}</span> : null}
        </a>
      ))}
    </nav>
  );
}
