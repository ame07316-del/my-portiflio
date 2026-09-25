import type { MetadataRoute } from "next";

/**
 * The public site is a single long page, so the sitemap is one entry.
 * Admin routes are deliberately absent (they are also disallowed in robots.ts).
 * Add future routes here as they appear.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
    .trim()
    .replace(/\/$/, "");

  return [
    {
      url: `${base}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
