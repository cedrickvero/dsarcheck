import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilePreview } from "@/app/app/_components/file-preview";
import type { CollectionFile } from "@/server/cases/collection";

const noop = async () => ({ ok: true });

const original: CollectionFile = { id: "f1", sourceKey: "Zendesk", name: "original.pdf", type: "application/pdf", sizeBytes: 10, version: 1, needsRedaction: true, isRedactedExport: false };
const redacted: CollectionFile = { id: "f2", sourceKey: null, name: "_redacted_v2.pdf", type: "application/pdf", sizeBytes: 8, version: 2, needsRedaction: false, isRedactedExport: true };

describe("FilePreview", () => {
  it("blurs an original and offers Open original · logged", () => {
    const html = renderToStaticMarkup(<FilePreview caseId="c1" caseNumber="X" file={original} openOriginal={noop} />);
    expect(html).toContain("Original v1 · access-controlled");
    expect(html).toContain("Preview hidden. The original contains unredacted personal data.");
    expect(html).toContain("Open original · logged");
    expect(html).toContain("blur(6px)");
  });

  it("shows a redacted export unblurred with no open-original gate", () => {
    const html = renderToStaticMarkup(<FilePreview caseId="c1" caseNumber="X" file={redacted} openOriginal={noop} />);
    expect(html).toContain("Redacted export");
    expect(html).not.toContain("Open original · logged");
    expect(html).not.toContain("blur(6px)");
  });
});
