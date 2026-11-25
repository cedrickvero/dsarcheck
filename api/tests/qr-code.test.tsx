import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QrCode } from "@/app/mfa/_components/qr-code";
import qrcodeModule from "@/lib/qrcode";

const OTPAUTH =
  "otpauth://totp/Privacyspace:mara%40northlight.io?secret=ZCDU3XHHCNC54NYKQALFBLNQ6262BF7X&issuer=Privacyspace&period=30&digits=6";

describe("QrCode", () => {
  it("renders an SVG with dark modules (the encoded matrix)", () => {
    const html = renderToStaticMarkup(<QrCode value={OTPAUTH} />);
    expect(html).toContain("<svg");
    expect(html).toContain('shape-rendering="crispEdges"');
    // The dark modules are individual <rect> elements (no innerHTML injection).
    expect(html.match(/<rect/g)?.length).toBeGreaterThan(100);
  });

  it("encodes a valid QR matrix (finder patterns present)", () => {
    const qr = (qrcodeModule as (n: number, l: string) => { addData(d: string): void; make(): void; getModuleCount(): number; isDark(r: number, c: number): boolean })(0, "M");
    qr.addData(OTPAUTH);
    qr.make();
    const n = qr.getModuleCount();
    expect(n).toBeGreaterThanOrEqual(21);
    // Top-left finder pattern: dark outer ring, white ring, dark 3x3 centre.
    expect(qr.isDark(0, 0)).toBe(true);
    expect(qr.isDark(0, 6)).toBe(true);
    expect(qr.isDark(6, 0)).toBe(true);
    expect(qr.isDark(1, 1)).toBe(false);
    expect(qr.isDark(3, 3)).toBe(true);
  });
});
