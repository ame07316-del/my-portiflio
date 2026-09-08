"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/admin/actions";

const nav = [
  { href: "/admin", label: "Overview", icon: "M3 3h8v8H3V3Zm10 0h8v5h-8V3ZM13 10h8v11h-8V10ZM3 13h8v8H3v-8Z" },
  { href: "/admin/projects", label: "Projects", icon: "m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5" },
  { href: "/admin/skills", label: "Skills", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { href: "/admin/services", label: "Services", icon: "M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 0v20M3 7l9 5 9-5" },
  { href: "/admin/experience", label: "Experience", icon: "M4 7h16v13H4zM9 7V4h6v3M4 12h16" },
  { href: "/admin/locations", label: "Globe locations", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.7 3.8 5.8 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.8-3.8-9S9.5 5.7 12 3Z" },
  { href: "/admin/messages", label: "Messages", icon: "M3 6h18v12H3zM3 7l9 6 9-6" },
  { href: "/admin/settings", label: "Site settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.09A1.7 1.7 0 0 0 10 3.04V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" },
  { href: "/admin/account", label: "Account", icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" },
];

export default function Sidebar({
  user,
  unread,
}: {
  user: { name: string; email: string };
  unread: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const Items = (
    <nav className="flex flex-1 flex-col gap-1">
      {nav.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              active
                ? "bg-white/8 text-white"
                : "text-white/50 hover:bg-white/4 hover:text-white/85"
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-[var(--accent)] to-[var(--accent-2)]" />
            )}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px] shrink-0"
            >
              <path d={item.icon} />
            </svg>
            <span className="flex-1">{item.label}</span>
            {item.href === "/admin/messages" && unread > 0 && (
              <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-black text-ink">
                {unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* mobile bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-white/8 bg-ink/85 px-4 py-3 backdrop-blur lg:hidden">
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-white/50">
          Admin
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-white/12 px-3 py-1.5 text-xs"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      <aside
        className={`${
          open ? "block" : "hidden"
        } fixed inset-x-0 top-[52px] z-40 border-b border-white/8 bg-ink/95 p-4 backdrop-blur lg:sticky lg:top-0 lg:block lg:h-screen lg:w-[268px] lg:shrink-0 lg:border-r lg:border-b-0 lg:bg-transparent lg:p-5`}
      >
        <div className="flex h-full flex-col">
          <Link href="/" className="mb-7 hidden items-center gap-2.5 lg:flex">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] font-mono text-xs font-black text-ink">
              {"</>"}
            </span>
            <span className="text-sm font-bold text-white">Control Center</span>
          </Link>

          {Items}

          <div className="mt-6 space-y-2 border-t border-white/8 pt-4">
            <Link
              href="/"
              target="_blank"
              className="flex items-center justify-between rounded-xl border border-white/8 px-3 py-2.5 text-xs text-white/55 transition hover:border-white/25 hover:text-white"
            >
              View live site <span>↗</span>
            </Link>
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[var(--accent)]/30 to-[var(--accent-2)]/30 text-xs font-bold">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-white">
                  {user.name}
                </span>
                <span className="block truncate text-[11px] text-white/35">
                  {user.email}
                </span>
              </span>
            </div>
            <form action={logoutAction}>
              <button className="w-full rounded-xl border border-white/8 px-3 py-2.5 text-xs text-white/55 transition hover:border-rose-500/40 hover:text-rose-300">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
