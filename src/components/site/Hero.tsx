"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { Dict } from "@/lib/i18n";
import type { Settings } from "@/lib/types";
import { useEntered } from "./useEntered";

const HeroScene = dynamic(() => import("@/components/three/HeroScene"), {
  ssr: false,
});

function Typewriter({ words }: { words: string[] }) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = words[index % words.length] ?? "";
    const done = !deleting && text === word;
    const empty = deleting && text === "";
    const delay = done ? 1600 : empty ? 250 : deleting ? 35 : 65;

    const t = setTimeout(() => {
      if (done) return setDeleting(true);
      if (empty) {
        setDeleting(false);
        setIndex((i) => i + 1);
        return;
      }
      setText(
        deleting ? word.slice(0, text.length - 1) : word.slice(0, text.length + 1),
      );
    }, delay);
    return () => clearTimeout(t);
  }, [text, deleting, index, words]);

  return (
    <span className="text-[var(--accent)]">
      {text}
      <span className="ms-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-[var(--accent)]" />
    </span>
  );
}

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 1400;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return (
    <span>
      {n}
      {suffix}
    </span>
  );
}

export default function Hero({
  dict,
  settings,
  name,
  role,
  tagline,
  heroLabel,
}: {
  dict: Dict;
  settings: Settings;
  name: string;
  role: string;
  tagline: string;
  heroLabel?: string;
}) {
  const entered = useEntered();
  const show = entered;
  const roles = [role, ...dict.hero.roles].filter(Boolean);

  const stats = [
    { value: settings.years, suffix: "+", label: dict.stats.years },
    { value: settings.projects_done, suffix: "+", label: dict.stats.projects },
    { value: settings.clients, suffix: "+", label: dict.stats.clients },
  ];

  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] items-center overflow-hidden pt-28 pb-16"
    >
      <div className="absolute inset-0">
        <div className="aurora" />
        <div className="grid-bg absolute inset-0 opacity-30 [mask-image:radial-gradient(70%_60%_at_50%_40%,#000,transparent)]" />
      </div>

      <div className="pointer-events-none absolute inset-y-0 end-0 w-full lg:w-[58%]">
        <HeroScene accent={settings.accent} accent2={settings.accent2} />
      </div>

      <div className="container-x relative z-10">
        <div className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={show ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs backdrop-blur"
          >
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full rounded-full ${settings.available ? "bg-emerald-400" : "bg-amber-400"}`}
                style={{ animation: "pulse-ring 2s ease-out infinite" }}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${settings.available ? "bg-emerald-400" : "bg-amber-400"}`}
              />
            </span>
            <span className="text-white/70">
              {settings.available ? dict.hero.available : dict.hero.busy}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 34 }}
            animate={show ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.9, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 text-[clamp(2.6rem,8vw,5.4rem)] leading-[0.95] font-black tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span className="block text-white/45 text-[0.32em] font-mono uppercase tracking-[0.5em] mb-4">
              {heroLabel || "Portfolio 2025"}
            </span>
            <span className="text-gradient">{name}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={show ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.16 }}
            className="mt-4 text-xl font-semibold sm:text-2xl"
          >
            <Typewriter words={roles} />
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={show ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.24 }}
            className="mt-5 max-w-xl text-base leading-relaxed text-white/55"
          >
            {tagline}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={show ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.32 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <a
              href="#work"
              className="group relative overflow-hidden rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-ink transition hover:scale-[1.03]"
            >
              <span className="relative z-10">{dict.hero.cta}</span>
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-transform duration-500 group-hover:translate-x-0" />
            </a>
            <a
              href="#contact"
              className="rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/85 backdrop-blur transition hover:border-[var(--accent)] hover:text-white"
            >
              {dict.hero.cta2}
            </a>
          </motion.div>

          <motion.dl
            initial={{ opacity: 0 }}
            animate={show ? { opacity: 1 } : {}}
            transition={{ duration: 1, delay: 0.5 }}
            className="mt-12 grid max-w-md grid-cols-3 gap-4 border-t border-white/10 pt-6"
          >
            {stats.map((s) => (
              <div key={s.label}>
                <dt
                  className="text-2xl font-black text-white sm:text-3xl"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {show ? <Counter to={s.value} suffix={s.suffix} /> : "0"}
                </dt>
                <dd className="mt-1 text-[11px] leading-tight text-white/45">
                  {s.label}
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>
      </div>

      <motion.a
        href="#about"
        initial={{ opacity: 0 }}
        animate={show ? { opacity: 1 } : {}}
        transition={{ delay: 1 }}
        className="absolute inset-x-0 bottom-6 mx-auto flex w-max flex-col items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-white/40"
      >
        {dict.hero.scroll}
        <span className="relative h-10 w-px overflow-hidden bg-white/15">
          <motion.span
            className="absolute inset-x-0 top-0 h-4 bg-[var(--accent)]"
            animate={{ y: [-16, 40] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        </span>
      </motion.a>
    </section>
  );
}
