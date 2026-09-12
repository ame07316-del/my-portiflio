"use client";

import { useEffect, useState, useTransition } from "react";
import { motion, useScroll, useSpring } from "motion/react";
import { setLang } from "@/app/actions";
import type { Dict } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const x = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.3 });
  return (
    <motion.div
      style={{ scaleX: x }}
      // `scroll-progress` flips the transform origin in RTL (see globals.css)
      className="scroll-progress fixed inset-x-0 top-0 z-[70] h-[2px] bg-gradient-to-r from-[var(--accent)] via-white to-[var(--accent-2)]"
    />
  );
}

export function Nav({
  dict,
  lang,
  name,
  cvUrl,
  brandMark = "</>",
  logoUrl = "",
  showGlobe = false,
}: {
  dict: Dict;
  lang: Lang;
  name: string;
  cvUrl?: string;
  brandMark?: string;
  logoUrl?: string;
  showGlobe?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "#about", label: dict.nav.about },
    { href: "#services", label: dict.nav.services },
    { href: "#work", label: dict.nav.work },
    ...(showGlobe ? [{ href: "#global", label: dict.nav.global }] : []),
    { href: "#skills", label: dict.nav.skills },
    { href: "#contact", label: dict.nav.contact },
  ];

  const switchTo = (next: Lang) => start(() => void setLang(next));

  return (
    <>
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4"
      >
        <nav
          className={`flex w-full max-w-6xl items-center justify-between rounded-2xl px-4 py-3 transition-all duration-500 ${
            scrolled ? "glass shadow-2xl shadow-black/40" : "bg-transparent"
          }`}
        >
          <a href="#top" className="group flex items-center gap-2.5">
            <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] font-mono text-sm font-black text-ink">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={name} className="h-full w-full object-cover" />
              ) : (
                brandMark
              )}
              <span className="absolute inset-0 rounded-xl bg-[var(--accent)] opacity-0 blur-md transition group-hover:opacity-60" />
            </span>
            <span className="hidden text-sm font-bold tracking-tight sm:block">
              {name}
            </span>
          </a>

          <ul className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="group relative rounded-lg px-3 py-2 text-sm text-white/65 transition hover:text-white"
                >
                  {l.label}
                  <span className="absolute inset-x-3 -bottom-0.5 h-px scale-x-0 bg-[var(--accent)] transition-transform duration-300 group-hover:scale-x-100" />
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5 font-mono text-[11px]">
              {(["en", "ar"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => switchTo(l)}
                  disabled={pending}
                  className={`rounded-lg px-2.5 py-1.5 uppercase transition ${
                    lang === l
                      ? "bg-white text-ink"
                      : "text-white/55 hover:text-white"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <a
              href={cvUrl || "#contact"}
              className="relative hidden overflow-hidden rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:scale-[1.03] sm:block"
            >
              {dict.nav.hire}
            </a>

            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={dict.nav.menu}
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 md:hidden"
            >
              <span className="flex flex-col gap-1">
                <span
                  className={`h-px w-4 bg-white transition ${open ? "translate-y-[3px] rotate-45" : ""}`}
                />
                <span
                  className={`h-px w-4 bg-white transition ${open ? "-translate-y-[3px] -rotate-45" : ""}`}
                />
              </span>
            </button>
          </div>
        </nav>
      </motion.header>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed inset-x-4 top-20 z-50 rounded-2xl p-2 md:hidden glass"
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-4 py-3 text-sm text-white/75 hover:bg-white/5"
            >
              {l.label}
            </a>
          ))}
        </motion.div>
      )}
    </>
  );
}

export function Cursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const move = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      const el = e.target as HTMLElement;
      setHover(Boolean(el.closest("a,button,[data-cursor]")));
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] hidden lg:block">
      <motion.div
        className="absolute rounded-full border border-white/40 mix-blend-difference"
        animate={{
          x: pos.x - (hover ? 22 : 10),
          y: pos.y - (hover ? 22 : 10),
          width: hover ? 44 : 20,
          height: hover ? 44 : 20,
          opacity: pos.x < 0 ? 0 : 1,
        }}
        transition={{ type: "spring", stiffness: 500, damping: 32, mass: 0.35 }}
      />
      <motion.div
        className="absolute h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
        animate={{ x: pos.x - 3, y: pos.y - 3, opacity: pos.x < 0 ? 0 : 1 }}
        transition={{ type: "spring", stiffness: 1200, damping: 40 }}
      />
    </div>
  );
}
