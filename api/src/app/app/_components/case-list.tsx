"use client";

/**
 * The case list: saved views, filters, the table, and the bulk bar.
 *
 * A Client Component because selection and the dialog are interactive; everything that
 * needs authority (the rows, the counts, the formatted dates and SLA labels) is computed
 * on the server and passed in. Nothing here decides what the caller may see.
 *
 * Accessibility is the defined behaviour, not a nice-to-have: the row link is a real
 * anchor (so Enter and middle-click work), the checkbox stops propagation so ticking a
 * row never opens it, status is always a word, and the bulk result is announced through a
 * live region rather than only shown as a toast.
 */
import { useState, useTransition } from "react";
import { CASE_LIST_COPY, CASE_VIEWS, type CaseViewKey } from "@/domain/caseList";
import { ReasonDialog } from "./reason-dialog";

/**
 * The actions arrive as props rather than being imported here: the page passes the real
 * server actions, and a test can pass stubs without dragging the database into a render
 * test.
 */
export type AssignAction = (input: {
  caseNumbers: string[];
  ownerId: string;
  reason: string;
}) => Promise<{ ok: boolean; data?: { updated: number; ownerName: string }; message?: string }>;

export type ExportAction = (input: {
  caseNumbers: string[];
  reason: string;
}) => Promise<{ ok: boolean; data?: { csv: string; filename: string; count: number }; message?: string }>;

export interface CaseRowView {
  caseNumber: string;
  requesterName: string;
  requesterEmail: string;
  requestType: string;
  status: string;
  statusLabel: string;
  ownerName: string | null;
  received: string;
  sla: { label: string; risk: string; pct: number };
  checklist: string;
  priority: "Normal" | "High";
}

export interface CaseListProps {
  client: string;
  rows: CaseRowView[];
  counts: Record<CaseViewKey, number>;
  view: CaseViewKey;
  q: string;
  type: string;
  status: string;
  owners: { id: string; name: string }[];
  intakeHref: string;
  assign: AssignAction;
  exportCsv: ExportAction;
  /** Human-readable description of the active filter, for the empty state. */
  filtersActive: boolean;
}

export function CaseList(props: CaseListProps) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<null | "assign" | "export">(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const ids = props.rows.filter((row) => selected[row.caseNumber]).map((row) => row.caseNumber);
  const allChecked = props.rows.length > 0 && ids.length === props.rows.length;

  const toggle = (caseNumber: string) =>
    setSelected((current) => ({ ...current, [caseNumber]: !current[caseNumber] }));

  const toggleAll = () =>
    setSelected(allChecked ? {} : Object.fromEntries(props.rows.map((row) => [row.caseNumber, true])));

  const clear = () => setSelected({});

  const runAssign = ({ reason, option }: { reason: string; option: string | null }) => {
    setError("");
    startTransition(async () => {
      const result = await props.assign({ caseNumbers: ids, ownerId: option ?? "", reason });
      if (!result.ok || !result.data) {
        setError(result.message ?? "The action could not be completed.");
        return;
      }
      setDialog(null);
      clear();
      setMessage(CASE_LIST_COPY.bulk.assigned(result.data.updated, result.data.ownerName));
    });
  };

  const runExport = ({ reason }: { reason: string; option: string | null }) => {
    setError("");
    startTransition(async () => {
      const result = await props.exportCsv({ caseNumbers: ids, reason });
      if (!result.ok || !result.data) {
        setError(result.message ?? "The export could not be completed.");
        return;
      }
      // The file is assembled on the server from the same authorised read the list uses.
      const blob = new Blob([result.data.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.data.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setDialog(null);
      clear();
      setMessage(CASE_LIST_COPY.bulk.exported(result.data.count));
    });
  };

  return (
    <section className="case-list">
      <header className="page-header">
        <div>
          <h1>{CASE_LIST_COPY.title}</h1>
          <p className="subtitle">{CASE_LIST_COPY.subtitle(props.client)}</p>
        </div>
        <a className="button button-outline" href={props.intakeHref} target="_blank" rel="noreferrer">
          {CASE_LIST_COPY.intakeLink}
        </a>
      </header>

      <nav className="view-chips" aria-label="Saved views">
        {CASE_VIEWS.map((view) => {
          const active = view.key === props.view;
          const query = new URLSearchParams();
          if (view.key !== "all") query.set("view", view.key);
          if (props.q) query.set("q", props.q);
          if (props.type !== "All") query.set("type", props.type);
          if (props.status !== "All") query.set("status", props.status);
          const href = `/app/cases${query.toString() ? `?${query}` : ""}`;
          return (
            <a
              key={view.key}
              href={href}
              className="chip"
              aria-current={active ? "page" : undefined}
              data-active={active ? "true" : "false"}
            >
              {view.label} <span className="count">{props.counts[view.key]}</span>
            </a>
          );
        })}
      </nav>

      <form className="filters" method="get" action="/app/cases" role="search">
        {props.view !== "all" ? <input type="hidden" name="view" value={props.view} /> : null}
        <label className="field field-search">
          <span className="visually-hidden">{CASE_LIST_COPY.searchLabel}</span>
          <input
            type="search"
            name="q"
            defaultValue={props.q}
            placeholder={CASE_LIST_COPY.searchPlaceholder}
          />
        </label>
        <label className="field">
          <span>{CASE_LIST_COPY.typeLabel}</span>
          <select name="type" defaultValue={props.type}>
            {["All", "Access", "Erasure", "Portability", "Rectification", "Objection"].map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{CASE_LIST_COPY.statusLabel}</span>
          <select name="status" defaultValue={props.status}>
            {["All", "New", "Verifying", "In progress", "Awaiting approval", "Completed", "Extended", "Rejected"].map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="button">Apply</button>
      </form>

      {ids.length > 0 ? (
        <div className="bulk-bar" role="region" aria-label="Bulk actions">
          <span>{CASE_LIST_COPY.bulk.selected(ids.length)}</span>
          <button type="button" className="button" onClick={() => setDialog("assign")}>
            {CASE_LIST_COPY.bulk.assign}
          </button>
          <button type="button" className="button button-outline" onClick={() => setDialog("export")}>
            {CASE_LIST_COPY.bulk.exportCsv}
          </button>
          <button type="button" className="button button-ghost" onClick={clear}>
            {CASE_LIST_COPY.bulk.clear}
          </button>
        </div>
      ) : null}

      <p aria-live="polite" role="status" className="status-line">
        {error ? <span className="error-text">{error}</span> : message}
      </p>

      {props.rows.length === 0 ? (
        <section className="state-panel" data-state="empty" role="status">
          <p className="state-marker" aria-hidden="true">{"\u25CB"}</p>
          <h2>{CASE_LIST_COPY.empty.title}</h2>
          <p>{CASE_LIST_COPY.empty.body}</p>
          {props.filtersActive ? (
            <a className="button button-outline" href="/app/cases">Clear filters</a>
          ) : null}
        </section>
      ) : (
        <table className="case-table">
          <caption className="visually-hidden">Cases in this workspace, nearest deadline first</caption>
          <thead>
            <tr>
              <th scope="col">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="Select all cases in this view"
                />
              </th>
              <th scope="col">{CASE_LIST_COPY.columns.case}</th>
              <th scope="col">{CASE_LIST_COPY.columns.requester}</th>
              <th scope="col">{CASE_LIST_COPY.columns.type}</th>
              <th scope="col">{CASE_LIST_COPY.columns.status}</th>
              <th scope="col">{CASE_LIST_COPY.columns.owner}</th>
              <th scope="col">{CASE_LIST_COPY.columns.received}</th>
              <th scope="col">{CASE_LIST_COPY.columns.sla} ↑</th>
              <th scope="col">{CASE_LIST_COPY.columns.checklist}</th>
              <th scope="col">{CASE_LIST_COPY.columns.priority}</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => {
              const checked = Boolean(selected[row.caseNumber]);
              return (
                <tr key={row.caseNumber} data-selected={checked ? "true" : "false"}>
                  <td>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(row.caseNumber)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Select ${row.caseNumber}`}
                    />
                  </td>
                  <th scope="row">
                    <a href={`/app/cases/${row.caseNumber}`} className="mono">{row.caseNumber}</a>
                  </th>
                  <td>
                    <span className="requester">{row.requesterName}</span>
                    <span className="email">{row.requesterEmail}</span>
                  </td>
                  <td>{row.requestType}</td>
                  <td>
                    <span className="status" data-status={row.status}>{row.statusLabel}</span>
                  </td>
                  <td>{row.ownerName ?? CASE_LIST_COPY.unassigned}</td>
                  <td>{row.received}</td>
                  <td>
                    <span className="sla-label" data-risk={row.sla.risk}>{row.sla.label}</span>
                    <span className="sla-bar" aria-hidden="true">
                      <span style={{ width: `${row.sla.pct}%` }} />
                    </span>
                  </td>
                  <td>{row.checklist}</td>
                  <td>{row.priority === "High" ? <span className="pill-high">High</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <ReasonDialog
        open={dialog === "assign"}
        title={CASE_LIST_COPY.bulk.assignTitle(ids.length)}
        description={CASE_LIST_COPY.bulk.assignDescription}
        confirmLabel={CASE_LIST_COPY.bulk.assignConfirm}
        reasonLabel={CASE_LIST_COPY.bulk.reasonLabel}
        reasonPlaceholder={CASE_LIST_COPY.bulk.reasonPlaceholder}
        option={{
          label: CASE_LIST_COPY.bulk.assignOptionLabel,
          name: "ownerId",
          initial: props.owners[0]?.id ?? "",
          values: props.owners.map((owner) => ({ value: owner.id, label: owner.name })),
        }}
        busy={pending}
        onCancel={() => setDialog(null)}
        onConfirm={runAssign}
      />

      <ReasonDialog
        open={dialog === "export"}
        title={`Export ${ids.length} ${ids.length === 1 ? "case" : "cases"} to CSV`}
        description="Each case records the export in its audit log."
        confirmLabel="Export CSV"
        reasonLabel={CASE_LIST_COPY.bulk.reasonLabel}
        reasonPlaceholder="e.g. Requester asked for their file list"
        busy={pending}
        onCancel={() => setDialog(null)}
        onConfirm={runExport}
      />
    </section>
  );
}
