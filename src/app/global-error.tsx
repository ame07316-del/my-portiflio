"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isDbConfig =
    error.message?.includes("DATABASE_URL") ||
    error.name === "MissingDatabaseUrlError";

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#05060a",
          color: "#e9ecf5",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 640, width: "100%" }}>
          <p
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 11,
              letterSpacing: "0.35em",
              textTransform: "uppercase",
              color: isDbConfig ? "#fbbf24" : "#f87171",
              margin: 0,
            }}
          >
            {isDbConfig ? "setup required" : "unexpected error"}
          </p>

          <h1
            style={{
              fontSize: 34,
              lineHeight: 1.15,
              fontWeight: 900,
              margin: "14px 0 0",
              letterSpacing: "-0.02em",
            }}
          >
            {isDbConfig ? "Connect a database" : "Something went wrong"}
          </h1>

          {isDbConfig ? (
            <>
              <p style={{ color: "rgba(255,255,255,.55)", lineHeight: 1.7 }}>
                This deployment has no <code>DATABASE_URL</code>. Serverless
                hosting has a read-only filesystem, so the local embedded
                database can&apos;t be used here.
              </p>
              <ol
                style={{
                  color: "rgba(255,255,255,.7)",
                  lineHeight: 2,
                  fontSize: 14,
                  paddingInlineStart: 20,
                }}
              >
                <li>Create a free Postgres database (Supabase / Neon).</li>
                <li>
                  Add <code>DATABASE_URL</code> and <code>AUTH_SECRET</code> in
                  Project → Settings → Environment Variables.
                </li>
                <li>Redeploy — the tables are created automatically.</li>
              </ol>
            </>
          ) : (
            <p style={{ color: "rgba(255,255,255,.55)", lineHeight: 1.7 }}>
              An unexpected error occurred while rendering this page.
              {error.digest ? ` (ref: ${error.digest})` : ""}
            </p>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button
              onClick={reset}
              style={{
                background: "#fff",
                color: "#05060a",
                border: 0,
                borderRadius: 12,
                padding: "12px 20px",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                border: "1px solid rgba(255,255,255,.16)",
                borderRadius: 12,
                padding: "12px 20px",
                fontSize: 14,
                color: "rgba(255,255,255,.8)",
                textDecoration: "none",
              }}
            >
              Open Supabase ↗
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
