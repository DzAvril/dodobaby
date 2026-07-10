import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "playwright-core", "sharp"],
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
    "/api/exports/month": ["./node_modules/playwright-core/**/*"],
  },
};

export default nextConfig;
