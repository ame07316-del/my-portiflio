import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Security headers for every route (public site + admin dashboard).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Block clickjacking / framing of the whole app.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
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
