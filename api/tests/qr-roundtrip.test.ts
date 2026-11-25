import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import qrcodeModule from "@/lib/qrcode";

// jsQR (MIT) is a QR DECODER - the inverse of the vendored encoder. Using it here proves
// the encoder emits a scannable matrix that decodes back to the exact input.
const require = createRequire(import.meta.url);
const jsQR = require("./fixtures/jsqr.js") as (
  data: Uint8ClampedArray,
  w: number,
  h: number,
) => { data: string } | null;

const OTPAUTH =
  "otpauth://totp/Privacyspace:mara%40northlight.io?secret=ZCDU3XHHCNC54NYKQALFBLNQ6262BF7X&issuer=Privacyspace&period=30&digits=6";

function encodeToRgba(value: string): { data: Uint8ClampedArray; size: number } {
  const qr = (qrcodeModule as (n: number, l: string) => { addData(d: string): void; make(): void; getModuleCount(): number; isDark(r: number, c: number): boolean })(0, "M");
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const data = new Uint8ClampedArray(n * n * 4);
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      const v = qr.isDark(r, c) ? 0 : 255;
      const i = (r * n + c) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, size: n };
}

describe("QR round-trip", () => {
  it("encodes the otpauth URI and decodes it back exactly", () => {
    const { data, size } = encodeToRgba(OTPAUTH);
    const decoded = jsQR(data, size, size);
    expect(decoded, "jsQR should decode the matrix").not.toBeNull();
    expect(decoded!.data).toBe(OTPAUTH);
  });
});
