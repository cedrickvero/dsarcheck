"use client";

/**
 * A QR code for the TOTP otpauth URI, so the user can scan it with a phone instead of
 * typing the setup key by hand. Zero-dependency: the encoder is vendored in
 * `src/lib/qrcode.ts` (the api service's node_modules is a Docker volume npm install
 * cannot reach). The value is the server-generated otpauth URI - trusted, not user
 * input - so it is rendered as static SVG rects with no innerHTML.
 */
import { useMemo, type ReactNode } from "react";
import qrcodeModule from "@/lib/qrcode";

interface QrInstance {
  addData(data: string): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}

const qrcode = qrcodeModule as (
  typeNumber: number,
  errorCorrectionLevel: "L" | "M" | "Q" | "H",
) => QrInstance;

export function QrCode({ value }: { value: string }) {
  const { size, rects } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n: number = qr.getModuleCount();
    const cells: ReactNode[] = [];
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        if (qr.isDark(r, c)) {
          cells.push(<rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="currentColor" />);
        }
      }
    }
    return { size: n, rects: cells };
  }, [value]);

  return (
    <svg
      className="mfa-qr"
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Setup QR code. Scan with your authenticator app."
    >
      <rect width={size} height={size} fill="#ffffff" />
      {rects}
    </svg>
  );
}
