import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin — Portfolio Control Center",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      dir="ltr"
      style={{ "--accent": "#22d3ee", "--accent-2": "#a855f7" } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
