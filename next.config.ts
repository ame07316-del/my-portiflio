import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the embedded Postgres (WASM) and pg out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // The embedded dev database must never be traced into serverless bundles.
  outputFileTracingExcludes: {
    "*": ["node_modules/@electric-sql/pglite/**"],
  },
  // Allow the sandbox / tunnel preview hosts to talk to the dev server.
  allowedDevOrigins: ["*.e2b.app", "*.vercel.app", "localhost"],
};

export default nextConfig;
