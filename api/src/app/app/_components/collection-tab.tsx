/**
 * E4a Collection & redaction (non-erasure): files list, the flagged-items warning, the
 * per-token redact form, and the request-review → complete-review → export flow. The
 * original file is never mutated — the export is a NEW version, generated only after
 * review is done.
 */
import type { CollectionView } from "@/server/cases/collection";
import { TokenRedactForm, type RedactionAction } from "./token-redact-form";
import { RedactionActions, type NoInputAction, type ReasonAction } from "./redaction-actions";
import type { RecordRedactedExportAction, UploadRedactedExportAction } from "./redacted-export-upload";
import { CollectionFiles, type OpenOriginalAction } from "./file-preview";

export function CollectionTab(props: {
  caseId: string;
  caseNumber: string;
  view: CollectionView;
  canCompleteReview: boolean;
  actions: {
    recordRedaction: RedactionAction;
    requestReview: NoInputAction;
    completeReview: ReasonAction;
    issueUpload: UploadRedactedExportAction;
    recordExport: RecordRedactedExportAction;
    openOriginal: OpenOriginalAction;
  };
}) {
  const v = props.view;
  const flagged = v.tokens.filter((t) => t.flagged);

  return (
    <section className="card" aria-labelledby="collection-title">
      <h2 id="collection-title">Collection &amp; redaction</h2>

      {flagged.length > 0 ? (
        <p className="warning-bar" role="status">
          {flagged.length} flagged item{flagged.length === 1 ? "" : "s"} may contain third-party or confidential data
        </p>
      ) : (
        <p className="muted">No flagged items. No redaction is required.</p>
      )}

      <h3>Files</h3>
      {v.files.length === 0 ? (
        <p className="muted">No files recorded for this case.</p>
      ) : (
        <CollectionFiles caseId={props.caseId} caseNumber={props.caseNumber} files={v.files} openOriginal={props.actions.openOriginal} />
      )}

      {flagged.length > 0 ? (
        <>
          <h3>Flagged items</h3>
          <table className="checklist-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Snippet</th>
                <th scope="col">Status</th>
                <th scope="col">Redact</th>
              </tr>
            </thead>
            <tbody>
              {flagged.map((t) => (
                <tr key={t.id}>
                  <td>{t.category}</td>
                  <td className="mono">{t.snippet || "—"}</td>
                  <td>
                    <span className="status" data-status={t.redacted ? "Completed" : "Action required"}>
                      {t.redacted ? "Redacted" : "Not redacted"}
                    </span>
                  </td>
                  <td>
                    <TokenRedactForm
                      caseId={props.caseId}
                      caseNumber={props.caseNumber}
                      tokenId={t.id}
                      redacted={t.redacted}
                      action={props.actions.recordRedaction}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <RedactionActions
        caseId={props.caseId}
        caseNumber={props.caseNumber}
        review={v.redactionReview}
        finalExportDone={v.finalExportDone}
        canCompleteReview={props.canCompleteReview}
        requestReview={props.actions.requestReview}
        completeReview={props.actions.completeReview}
        issueUpload={props.actions.issueUpload}
        recordExport={props.actions.recordExport}
      />
    </section>
  );
}
