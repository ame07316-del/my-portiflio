"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Reveal, SectionHeading } from "./Reveal";
import type { Dict } from "@/lib/i18n";
import type { Experience, Lang, Project, Service, Settings, Skill } from "@/lib/types";
import { pick } from "@/lib/types";

/* ---------------------------------- icons --------------------------------- */

const icons: Record<string, React.ReactNode> = {
  code: (
    <path d="M8 6 2 12l6 6M16 6l6 6-6 6M14 4l-4 16" />
  ),
  layers: <path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5" />,
  dashboard: (
    <path d="M3 3h8v8H3V3Zm10 0h8v5h-8V3ZM13 10h8v11h-8V10ZM3 13h8v8H3v-8Z" />
  ),
  cube: <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 0v20M3 7l9 5 9-5" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
};

function Icon({ name, className = "h-6 w-6" }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {icons[name] ?? icons.code}
    </svg>
  );
}

/* --------------------------------- marquee -------------------------------- */

export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items];
  return (
    <div className="marquee-mask relative border-y border-white/10 bg-white/[0.02] py-5">
      <div className="flex w-max animate-[marquee_38s_linear_infinite] gap-10">
        {row.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="flex items-center gap-10 font-mono text-sm uppercase tracking-[0.25em] text-white/35"
          >
            {t}
            <span className="text-[var(--accent)]">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- about --------------------------------- */

export function About({
  dict,
  settings,
  lang,
  about,
}: {
  dict: Dict;
  settings: Settings;
  lang: Lang;
  about: string;
}) {
  const points = [
    { k: "01", v: pick(settings, "role", lang) },
    { k: "02", v: pick(settings, "location", lang) },
    { k: "03", v: settings.email },
  ];
  return (
    <section id="about" className="relative py-24 sm:py-32">
      <div className="container-x grid gap-14 lg:grid-cols-[1fr_1.15fr] lg:items-center">
        <Reveal>
          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-[var(--accent)]/25 to-[var(--accent-2)]/25 blur-2xl" />
            <div className="relative overflow-hidden rounded-[1.6rem] border border-white/10">
              <Image
                src="/avatar.png"
                alt=""
                width={640}
                height={640}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-transparent" />
              <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur">
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/60">
                  {pick(settings, "location", lang)}
                </span>
                <span className="text-[10px] font-bold text-[var(--accent)]">
                  {settings.available ? "OPEN" : "BUSY"}
                </span>
              </div>
            </div>
          </div>
        </Reveal>

        <div>
          <SectionHeading label={dict.about.label} title={dict.about.title} />
          <Reveal delay={0.1}>
            <p className="mt-6 text-base leading-8 text-white/60">{about}</p>
          </Reveal>
          <Reveal delay={0.15}>
            <ul className="mt-8 space-y-3">
              {points.map((p) => (
                <li
                  key={p.k}
                  className="flex items-center gap-4 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3"
                >
                  <span className="font-mono text-[11px] text-[var(--accent)]">
                    {p.k}
                  </span>
                  <span className="text-sm text-white/70">{p.v}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          {settings.resume_url && (
            <Reveal delay={0.2}>
              <a
                href={settings.resume_url}
                className="mt-8 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold transition hover:border-[var(--accent)]"
              >
                {dict.about.download}
                <span aria-hidden>↓</span>
              </a>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- services -------------------------------- */

export function Services({
  dict,
  services,
  lang,
}: {
  dict: Dict;
  services: Service[];
  lang: Lang;
}) {
  return (
    <section id="services" className="relative py-24 sm:py-28">
      <div className="container-x">
        <SectionHeading
          label={dict.services.label}
          title={dict.services.title}
          subtitle={dict.services.subtitle}
          center
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s, i) => (
            <Reveal key={s.id} delay={i * 0.07}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] p-6 transition duration-500 hover:border-[var(--accent)]/40 hover:bg-white/[0.04]">
                <div className="absolute -end-8 -top-8 h-28 w-28 rounded-full bg-[var(--accent)]/10 blur-2xl transition group-hover:bg-[var(--accent)]/25" />
                <div className="relative grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-transparent text-[var(--accent)]">
                  <Icon name={s.icon} />
                </div>
                <h3 className="relative mt-5 text-lg font-bold">
                  {pick(s, "title", lang)}
                </h3>
                <p className="relative mt-2 text-sm leading-6 text-white/50">
                  {pick(s, "desc", lang)}
                </p>
                <span className="relative mt-5 block font-mono text-[10px] tracking-[0.3em] text-white/25">
                  0{i + 1}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- work ---------------------------------- */

function ProjectCard({
  project,
  lang,
  dict,
  index,
}: {
  project: Project;
  lang: Lang;
  dict: Dict;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1100px) rotateY(${x * 9}deg) rotateX(${-y * 9}deg) translateY(-6px)`;
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = "";
  };

  return (
    <Reveal delay={index * 0.08}>
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={reset}
        className="tilt-card group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02]"
      >
        <div className="relative aspect-[16/10] overflow-hidden">
          {project.image ? (
            <Image
              src={project.image}
              alt={pick(project, "title", lang)}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover transition duration-700 group-hover:scale-[1.06]"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-2)]/20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-transparent" />
          <div className="absolute start-4 top-4 flex gap-2">
            {project.featured && (
              <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-ink">
                Featured
              </span>
            )}
            <span className="rounded-full border border-white/15 bg-black/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white/70 backdrop-blur">
              {project.category}
            </span>
          </div>
        </div>

        <div className="tilt-inner relative -mt-10 p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h3
              className="text-xl font-black tracking-tight sm:text-2xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {pick(project, "title", lang)}
            </h3>
            <span className="font-mono text-xs text-white/35">{project.year}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-white/55">
            {pick(project, "summary", lang)}
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {project.tags.slice(0, 5).map((t) => (
              <span
                key={t}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-white/55"
              >
                {t}
              </span>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {project.live_url && (
              <a
                href={project.live_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group/btn inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-ink transition hover:gap-3"
              >
                {dict.work.live}
                <span aria-hidden>↗</span>
              </a>
            )}
            {project.admin_url && (
              <a
                href={project.admin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-2.5 text-xs font-bold text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
              >
                {dict.work.admin}
              </a>
            )}
            {project.repo_url && (
              <a
                href={project.repo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-xs font-semibold text-white/70 transition hover:border-white/30"
              >
                {dict.work.code}
              </a>
            )}
          </div>
        </div>
      </div>
    </Reveal>
  );
}

export function Work({
  dict,
  projects,
  lang,
}: {
  dict: Dict;
  projects: Project[];
  lang: Lang;
}) {
  const categories = Array.from(new Set(projects.map((p) => p.category)));
  const [filter, setFilter] = useState<string>("all");
  const list =
    filter === "all" ? projects : projects.filter((p) => p.category === filter);

  return (
    <section id="work" className="relative py-24 sm:py-32">
      <div className="absolute inset-x-0 top-1/3 -z-10 h-96 bg-[radial-gradient(50%_50%_at_50%_50%,color-mix(in_oklab,var(--accent-2)_16%,transparent),transparent)]" />
      <div className="container-x">
        <SectionHeading
          label={dict.work.label}
          title={dict.work.title}
          subtitle={dict.work.subtitle}
        />

        {categories.length > 1 && (
          <Reveal delay={0.1}>
            <div className="mt-8 flex flex-wrap gap-2">
              {["all", ...categories].map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`rounded-xl border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition ${
                    filter === c
                      ? "border-transparent bg-white text-ink"
                      : "border-white/10 bg-white/5 text-white/55 hover:text-white"
                  }`}
                >
                  {c === "all" ? dict.work.all : c}
                </button>
              ))}
            </div>
          </Reveal>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {list.map((p, i) => (
            <ProjectCard
              key={p.id}
              project={p}
              lang={lang}
              dict={dict}
              index={i}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- skills --------------------------------- */

export function Skills({
  dict,
  skills,
}: {
  dict: Dict;
  skills: Skill[];
}) {
  const grouped = skills.reduce<Record<string, Skill[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <section id="skills" className="relative py-24 sm:py-28">
      <div className="container-x">
        <SectionHeading label={dict.skills.label} title={dict.skills.title} />
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {Object.entries(grouped).map(([cat, list], gi) => (
            <Reveal key={cat} delay={gi * 0.08}>
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--accent)]">
                  {dict.skills.categories[
                    cat as keyof Dict["skills"]["categories"]
                  ] ?? cat}
                </h3>
                <ul className="mt-5 space-y-4">
                  {list.map((s) => (
                    <li key={s.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-white/80">{s.name}</span>
                        <span className="font-mono text-[11px] text-white/35">
                          {s.level}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]"
                          initial={{ width: 0 }}
                          whileInView={{ width: `${s.level}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- timeline -------------------------------- */

export function Timeline({
  dict,
  items,
  lang,
}: {
  dict: Dict;
  items: Experience[];
  lang: Lang;
}) {
  if (!items.length) return null;
  return (
    <section className="relative py-24 sm:py-28">
      <div className="container-x">
        <SectionHeading label={dict.timeline.label} title={dict.timeline.title} />
        <div className="relative mt-14 ps-6 sm:ps-10">
          <div className="absolute inset-y-0 start-0 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />
          {items.map((e, i) => (
            <Reveal key={e.id} delay={i * 0.08}>
              <div className="relative pb-12">
                <span className="absolute -start-6 top-1.5 grid h-3 w-3 place-items-center rounded-full bg-[var(--accent)] sm:-start-10">
                  <span className="absolute h-3 w-3 rounded-full bg-[var(--accent)]/50 [animation:pulse-ring_2.4s_ease-out_infinite]" />
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/35">
                  {e.period}
                </span>
                <h3 className="mt-2 text-xl font-bold">{pick(e, "role", lang)}</h3>
                <p className="text-sm text-[var(--accent)]">{pick(e, "org", lang)}</p>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-white/50">
                  {pick(e, "desc", lang)}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- process -------------------------------- */

export function Process({ dict }: { dict: Dict }) {
  return (
    <section className="relative py-24">
      <div className="container-x">
        <SectionHeading
          label={dict.process.label}
          title={dict.process.title}
          center
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {dict.process.steps.map((s, i) => (
            <Reveal key={s.t} delay={i * 0.08}>
              <div className="relative h-full rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.05] to-transparent p-6">
                <span
                  className="block text-5xl font-black text-white/8"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  0{i + 1}
                </span>
                <h3 className="mt-3 text-lg font-bold">{s.t}</h3>
                <p className="mt-2 text-sm leading-6 text-white/50">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- footer --------------------------------- */

export function Footer({
  dict,
  settings,
  lang,
}: {
  dict: Dict;
  settings: Settings;
  lang: Lang;
}) {
  const year = new Date().getFullYear();
  const socials = [
    { href: settings.github, label: "GitHub" },
    { href: settings.linkedin, label: "LinkedIn" },
    { href: settings.twitter, label: "X" },
    settings.whatsapp
      ? { href: `https://wa.me/${settings.whatsapp}`, label: "WhatsApp" }
      : null,
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <footer className="relative border-t border-white/10 py-12">
      <div className="container-x flex flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-start">
        <div>
          <p className="text-sm font-bold">{pick(settings, "name", lang)}</p>
          <p className="mt-1 text-xs text-white/40">{dict.footer.built}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-white/50">
          {socials.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-[var(--accent)]"
            >
              {s.label}
            </a>
          ))}
          <a href="/admin" className="transition hover:text-[var(--accent)]">
            {dict.footer.admin}
          </a>
        </div>
        <p className="font-mono text-[11px] text-white/30">
          © {year} — {dict.footer.rights}
        </p>
      </div>
    </footer>
  );
}
