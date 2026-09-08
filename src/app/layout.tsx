import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { LANG_COOKIE } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portfolio — Full-Stack Web Developer",
  description:
    "Web developer building fast, beautiful websites, web apps and the admin dashboards that power them.",
  openGraph: {
    title: "Portfolio — Full-Stack Web Developer",
    description:
      "Websites, web apps and admin dashboards, crafted with Next.js and WebGL.",
    type: "website",
  },
};

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
  const store = await cookies();
  const lang = ((store.get(LANG_COOKIE)?.value as Lang) || "en") as Lang;
  const dir = lang === "ar" ? "rtl" : "ltr";

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
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;800;900&family=Inter:wght@300;400;500;600;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`:root{--font-display:"Space Grotesk","Segoe UI",system-ui,sans-serif}`}</style>
      </head>
      <body className="noise min-h-full bg-ink text-white/90">{children}</body>
    </html>
  );
}
