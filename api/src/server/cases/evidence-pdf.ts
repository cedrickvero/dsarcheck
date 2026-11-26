/**
 * Zero-dependency deterministic PDF renderer for the evidence pack (docs/03 E6).
 *
 * The api service cannot add npm packages (its node_modules is a separate Docker volume),
 * so this emits a minimal, valid PDF 1.4 by hand: Helvetica/Helvetica-Bold text, one
 * content stream per page, no compression. Output is deterministic for a given pack
 * (same input -> same bytes), which is what lets the signed-link service bind a content
 * hash to the exact artifact it will later serve.
 *
 * Text is mapped to WinAnsi-safe ASCII: the built-in Helvetica font uses StandardEncoding,
 * so an unmapped Unicode codepoint (an em dash, a bullet) would render as garbage or be
 * dropped by some viewers.
 */
import type { EvidencePackData } from "@/domain/evidence";

const PAGE_WIDTH = 595; // A4, points
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const LINE_HEIGHT = 14;
const BOTTOM = 60;

/** Map the handful of non-ASCII punctuation the domain emits onto ASCII, drop the rest. */
function toPdfText(s: string): string {
  return s
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/\u00b7/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e]/g, "?");
}

function escapePdf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

type Line = { text: string; font: "title" | "head" | "body" };

function packLines(data: EvidencePackData): Line[] {
  const lines: Line[] = [
    { text: `Evidence pack - ${data.caseNumber}`, font: "title" },
    { text: data.clientName, font: "body" },
    { text: `${data.draft ? "Draft" : "Final"} - generated ${data.generatedAt}`, font: "body" },
    { text: "", font: "body" },
  ];
  for (const section of data.sections) {
    lines.push({ text: section.title, font: "head" });
    for (const p of section.pairs) {
      lines.push({ text: `${p.label}: ${p.value}`, font: "body" });
    }
    if (section.table) {
      lines.push({ text: section.table.columns.join("  "), font: "body" });
      for (const row of section.table.rows) {
        lines.push({ text: row.join("  "), font: "body" });
      }
    }
    lines.push({ text: "", font: "body" });
  }
  return lines;
}

const FONT = { title: ["F2", 15], head: ["F3", 11.5], body: ["F1", 9.5] } as const;

/** Lay `lines` out into pages and return one content stream per page. */
function renderContentStreams(lines: Line[]): string[] {
  const pages: string[] = [];
  let ops: string[] = [];
  let y = PAGE_HEIGHT - MARGIN;

  const emit = (line: Line) => {
    const [font, size] = FONT[line.font];
    ops.push(`BT /${font} ${size} Tf ${MARGIN} ${y} Td (${escapePdf(toPdfText(line.text))}) Tj ET`);
    y -= LINE_HEIGHT;
  };

  for (const line of lines) {
    if (y < BOTTOM) {
      pages.push(ops.join("\n"));
      ops = [];
      y = PAGE_HEIGHT - MARGIN;
    }
    emit(line);
  }
  if (ops.length) pages.push(ops.join("\n"));
  return pages;
}

/** Assemble a PDF 1.4 file from a list of content streams. Deterministic for a given input. */
function assemblePdf(contentStreams: string[]): Buffer {
  const n = contentStreams.length;
  // Object numbering:
  //   1 Catalog, 2 Pages, 3..(2+n) Page objects, 3+n..(2+2n) Content streams,
  //   3+2n Font F1, 4+2n Font F2, 5+2n Font F3.
  const firstPage = 3;
  const firstContent = 3 + n;
  const fontHelvetica = 3 + 2 * n;
  const fontHelveticaBold = 4 + 2 * n;
  const fontHelveticaBoldSmall = 5 + 2 * n;
  const total = fontHelveticaBoldSmall;

  const objects: string[] = [];
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${Array.from({ length: n }, (_, i) => `${firstPage + i} 0 R`).join(" ")}] /Count ${n} >>`;
  for (let i = 0; i < n; i += 1) {
    objects[firstPage + i] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 ${fontHelvetica} 0 R /F2 ${fontHelveticaBold} 0 R /F3 ${fontHelveticaBoldSmall} 0 R >> >> ` +
      `/Contents ${firstContent + i} 0 R >>`;
  }
  for (let i = 0; i < n; i += 1) {
    const stream = contentStreams[i]!;
    objects[firstContent + i] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`;
  }
  objects[fontHelvetica] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[fontHelveticaBold] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;
  objects[fontHelveticaBoldSmall] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i <= total; i += 1) {
    offsets[i] = Buffer.byteLength(out, "ascii");
    out += `${i} 0 obj\n${objects[i]!}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(out, "ascii");
  out += `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= total; i += 1) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(out, "ascii");
}

export function renderEvidencePackPdf(data: EvidencePackData): Uint8Array<ArrayBuffer> {
  const bytes = assemblePdf(renderContentStreams(packLines(data)));
  // Copy into a fresh ArrayBuffer-backed view so the result satisfies web BodyInit types.
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}
