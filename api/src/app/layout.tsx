import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BRAND } from "@/domain/platform";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND,
  description: "DSAR fulfillment and evidence workspace",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
