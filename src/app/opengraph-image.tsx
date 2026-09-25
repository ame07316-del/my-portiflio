import { ImageResponse } from "next/og";
import { getSettingsSafe } from "@/lib/queries";

/**
 * Social share card (1200×630) — generated from the admin settings, so it
 * follows the brand automatically: no binary to remember to re-export.
 *
 * Rendered with the built-in Latin font on purpose: `name_en` / `role_en`
 * are what appear here. Next wires this file into `og:image` and
 * `twitter:image` for you.
 */
export const alt = "Portfolio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Settings live in Postgres, so this must not be baked at build time.
export const dynamic = "force-dynamic";

export default async function OpengraphImage() {
  const settings = await getSettingsSafe();

  const name = settings.name_en || "Portfolio";
  const role = settings.role_en || "Web Developer";
  const accent = settings.accent || "#22d3ee";
  const accent2 = settings.accent2 || "#a855f7";
  const year = new Date().getFullYear();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#05060a",
          color: "#fff",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-160px",
            right: "-120px",
            width: "620px",
            height: "620px",
            borderRadius: "9999px",
            background: `radial-gradient(circle at 30% 30%, ${accent}55, transparent 62%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-220px",
            left: "-80px",
            width: "560px",
            height: "560px",
            borderRadius: "9999px",
            background: `radial-gradient(circle at 60% 40%, ${accent2}55, transparent 60%)`,
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: "22px",
            letterSpacing: "6px",
            color: "#ffffff99",
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "16px",
              background: `linear-gradient(135deg, ${accent}, ${accent2})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#05060a",
              fontSize: "26px",
              fontWeight: 700,
            }}
          >
            {(settings.brand_mark || "</>").slice(0, 3)}
          </div>
          {settings.hero_label_en || `Portfolio ${year}`}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ fontSize: "96px", fontWeight: 700, lineHeight: 1.02 }}>
            {name}
          </div>
          <div style={{ fontSize: "40px", color: `${accent}` }}>{role}</div>
          {settings.tagline_en ? (
            <div style={{ fontSize: "26px", color: "#ffffffb3", maxWidth: "860px" }}>
              {settings.tagline_en.slice(0, 150)}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid #ffffff1f",
            paddingTop: "26px",
            fontSize: "24px",
            color: "#ffffff99",
          }}
        >
          <span>{settings.email || "hello@example.com"}</span>
          <span style={{ color: settings.available ? "#7ef0b0" : "#ffffff77" }}>
            {settings.available ? "● available for work" : "○ busy"}
          </span>
        </div>
      </div>
    ),
    { ...size, headers: { "cache-control": "public, max-age=3600" } },
  );
}
