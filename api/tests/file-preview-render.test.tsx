import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilePreview } from "@/app/app/_components/file-preview";
import type { CollectionFile } from "@/server/cases/collection";

const noop = async () => ({ ok: true });

const original: CollectionFile = { id: "f1", sourceKey: "Zendesk", name: "original.pdf", type: "application/pdf", sizeBytes: 10, version: 1, needsRedaction: true, isRedactedExport: false };
const redacted: CollectionFile = { id: "f2", sourceKey: null, name: "_redacted_v2.pdf", type: "application/pdf", sizeBytes: 8, version: 2, needsRedaction: false, isRedactedExport: true };

describe("FilePreview", () => {
  it("hides an original behind the open-original gate (no bytes fetched)", () => {
    const html = renderToStaticMarkup(<FilePreview caseId="c1" caseNumber="X" file={original} openOriginal={noop} />);
    expect(html).toContain("Original v1 · access-controlled");
    expect(html).toContain("Preview hidden. The original contains unredacted personal data.");
    expect(html).toContain("Open original · logged");
    expect(html).not.toContain("/api/cases/c1/files/f1/content");
  });

  it("shows a redacted export via the content endpoint with no gate", () => {
    const html = renderToStaticMarkup(<FilePreview caseId="c1" caseNumber="X" file={redacted} openOriginal={noop} />);
    expect(html).toContain("Redacted export");
    expect(html).not.toContain("Open original · logged");
    expect(html).toContain("/api/cases/c1/files/f2/content");
  });
});
