import type { NextConfig } from "next";
import { securityHeaders } from "./src/server/http/security-headers";

// Evaluated at build/start time, which is when the header set is fixed.
const production = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Server-only Node packages must not be bundled; keep them external.
  serverExternalPackages: ["pg", "nodemailer", "ioredis", "bullmq"],

  // Matches the production path in the Dockerfile.
  output: "standalone",

  // R3: security headers on every response, from one definition.
  async headers() {
    return [{ source: "/:path*", // includeCsp:false - the CSP needs a per-request nonce, so src/middleware.ts owns it.
      headers: securityHeaders({ production, includeCsp: false }) }];
  },
};

export default nextConfig;
