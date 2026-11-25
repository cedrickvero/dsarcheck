/**
 * E6 Evidence pack: the version list and the nine-section document preview. The PDF/ZIP
 * download and signed-link sharing are a storage-slice concern; this renders the snapshot
 * the server persisted.
 */
import type { EvidenceView } from "@/server/cases/evidence";
import type { EvidencePackData } from "@/domain/evidence";
import { GeneratePackButton, type GeneratePackAction } from "./generate-pack-button";

export function EvidenceTab(props: {
  caseId: string;
  caseNumber: string;
  view: EvidenceView;
  canGenerate: boolean;
  action: GeneratePackAction;
}) {
  const v = props.view;

  return (
    <section className="card" aria-labelledby="evidence-title">
      <h2 id="evidence-title">Evidence pack</h2>

      {props.canGenerate ? (
        <div className="evidence-actions">
          <GeneratePackButton
            caseId={props.caseId}
            caseNumber={props.caseNumber}
            hasVersions={v.versions.length > 0}
            action={props.action}
          />
        </div>
      ) : null}

      {v.versions.length === 0 ? (
        <p className="muted">No evidence pack generated yet.</p>
      ) : (
        <>
          <h3>Versions</h3>
          <ul className="version-list">
            {v.versions.map((ver) => (
              <li key={ver.version}>
                <span className="system-name">v{ver.version}</span>
                <span className="status" data-status={ver.draft ? "In progress" : "Completed"}>
                  {ver.draft ? "Draft" : "Final"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {v.latest ? <DocumentPreview data={v.latest} /> : null}
    </section>
  );
}

function DocumentPreview({ data }: { data: EvidencePackData }) {
  return (
    <div className="evidence-doc">
      <div className="evidence-doc-header">
        <span className="system-name">
          {data.clientName} · {data.caseNumber}
        </span>
        <span className="status" data-status={data.draft ? "In progress" : "Completed"}>
          {data.draft ? "Draft · case open" : "Final"}
        </span>
      </div>
      {data.sections.map((s, i) => (
        <section key={s.title}>
          <h4>
            {i + 1}. {s.title}
          </h4>
          {s.table ? (
            <table className="checklist-table">
              <thead>
                <tr>
                  {s.table.columns.map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.table.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <dl className="evidence-pairs">
              {s.pairs.length === 0 ? (
                <p className="muted">Nothing recorded.</p>
              ) : (
                s.pairs.map((p, pi) => (
                  <div key={pi} className="evidence-pair">
                    <dt>{p.label}</dt>
                    <dd>{p.value}</dd>
                  </div>
                ))
              )}
            </dl>
          )}
        </section>
      ))}
    </div>
  );
}
