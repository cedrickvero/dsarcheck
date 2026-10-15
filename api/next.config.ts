import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only Node packages must not be bundled; keep them external.
  serverExternalPackages: ["pg", "nodemailer", "ioredis", "bullmq"],

  // Matches the production path in the Dockerfile.
  output: "standalone",
};

export default nextConfig;
