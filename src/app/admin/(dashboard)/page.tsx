import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { getSession } from "@/lib/auth";
import {
  getExperiences,
  getMessages,
  getProjects,
  getServices,
  getSettings,
  getSkills,
  getStats,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025] p-5">
      <div
        className={`pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full blur-2xl ${
          accent ? "bg-[var(--accent)]/25" : "bg-white/5"
        }`}
      />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
        {label}
      </p>
      <p className="mt-2 text-4xl font-black tracking-tight text-white">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-white/35">{hint}</p>}
    </div>
  );
}

export default async function AdminOverview() {
  const [session, stats, messages, projects, skills, services, experiences, settings] =
    await Promise.all([
      getSession(),
      getStats(),
      getMessages(),
      getProjects(false),
      getSkills(),
      getServices(),
      getExperiences(),
      getSettings(),
    ]);

  const recent = messages.slice(0, 5);
  const published = projects.filter((p) => p.published).length;

  const checklist = [
    { label: "Site name & role filled", done: settings.name_en !== "Your Name" },
    { label: "Contact email added", done: Boolean(settings.email) },
    { label: "At least 3 projects", done: projects.length >= 3 },
    { label: "Social links added", done: Boolean(settings.github || settings.linkedin) },
    { label: "CV / resume link", done: Boolean(settings.resume_url) },
  ];

  return (
    <>
      <PageHeader
        title={`Welcome back, ${session?.name ?? "Admin"} 👋`}
        desc="Everything on your portfolio, controlled from here."
      >
        <Link
          href="/admin/projects/new"
          className="rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-4 py-2.5 text-sm font-bold text-ink"
        >
          + New project
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Projects" value={projects.length} hint={`${published} published`} />
        <StatCard
          label="Unread messages"
          value={stats.unread}
          hint={`${messages.length} total`}
          accent={stats.unread > 0}
        />
        <StatCard label="Skills" value={skills.length} hint={`${services.length} services`} />
        <StatCard
          label="Experience"
          value={experiences.length}
          hint={`${settings.years} yrs on site`}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5 sm:p-6">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Recent messages</h2>
            <Link
              href="/admin/messages"
              className="text-xs text-[var(--accent)] hover:underline"
            >
              View all →
            </Link>
          </header>
          {recent.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/35">
              No messages yet. They&apos;ll appear here the moment someone uses the
              contact form.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {recent.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start gap-3 rounded-xl border border-white/6 bg-white/[0.02] p-3.5"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      m.is_read ? "bg-white/20" : "bg-[var(--accent)]"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-white">
                        {m.name}
                      </p>
                      <span className="shrink-0 font-mono text-[10px] text-white/30">
                        {new Date(m.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="truncate text-xs text-white/40">{m.email}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">
                      {m.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5 sm:p-6">
            <h2 className="text-base font-bold text-white">Setup checklist</h2>
            <ul className="mt-4 space-y-2.5">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center gap-3 text-sm">
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] ${
                      c.done
                        ? "bg-emerald-400/15 text-emerald-300"
                        : "bg-white/8 text-white/30"
                    }`}
                  >
                    {c.done ? "✓" : "•"}
                  </span>
                  <span className={c.done ? "text-white/45 line-through" : "text-white/75"}>
                    {c.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5 sm:p-6">
            <h2 className="text-base font-bold text-white">Quick actions</h2>
            <div className="mt-4 grid gap-2">
              {[
                { href: "/admin/settings", label: "Edit hero & about text" },
                { href: "/admin/skills", label: "Update skills" },
                { href: "/admin/services", label: "Manage services" },
                { href: "/admin/account", label: "Change password" },
              ].map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex items-center justify-between rounded-xl border border-white/8 px-3.5 py-2.5 text-sm text-white/65 transition hover:border-[var(--accent)]/40 hover:text-white"
                >
                  {a.label} <span className="text-[var(--accent)]">→</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
