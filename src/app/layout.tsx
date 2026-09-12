import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { LANG_COOKIE } from "@/lib/i18n";
import { fontPair, googleFontsHref } from "@/lib/brand";
import { getSettingsSafe } from "@/lib/queries";
import { pick, type Lang } from "@/lib/types";
import "./globals.css";

async function currentLang(): Promise<Lang> {
  const store = await cookies();
  return ((store.get(LANG_COOKIE)?.value as Lang) || "en") as Lang;
}

export async function generateMetadata(): Promise<Metadata> {
  const [lang, settings] = await Promise.all([currentLang(), getSettingsSafe()]);
  const name = pick(settings, "name", lang);
  const role = pick(settings, "role", lang);
  const title = pick(settings, "meta_title", lang) || `${name} — ${role}`;
  const description =
    pick(settings, "meta_desc", lang) ||
    pick(settings, "tagline", lang) ||
    `${name}, ${role}.`;

  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return {
    metadataBase: new URL(base),
    title,
    description,
    icons: settings.logo_url ? { icon: settings.logo_url } : undefined,
    openGraph: {
      title,
      description,
      type: "website",
      images: settings.avatar_url ? [settings.avatar_url] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export const viewport: Viewport = {
  themeColor: "#05060a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [lang, settings] = await Promise.all([currentLang(), getSettingsSafe()]);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const pair = fontPair(settings.font_pair);

  return (
    <html lang={lang} dir={dir} className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Loaded from the visitor's browser (works even when the build machine is offline) */}
        <link href={googleFontsHref(settings.font_pair)} rel="stylesheet" />
        <style>{`:root{--font-display:${pair.display},"Segoe UI",system-ui,sans-serif;--accent:${settings.accent};--accent-2:${settings.accent2};--gold:${settings.globe_color}}`}</style>
      </head>
      <body className="noise min-h-full bg-ink text-white/90">{children}</body>
    </html>
  );
}
