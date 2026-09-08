"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type TourSection = { id: string; label: string };

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* timings (ms) */
const DIVE = 2100; // fall to the very bottom
const HOLD_BOTTOM = 900;
const TRAVEL = 1250; // move between two sections
const HOLD = 1500; // stay on a section
const CLIMB_HOME = 1400;

const SEEN_KEY = "pf_tour_v2";

export default function QuickTour({
  label,
  hint,
  exitLabel,
  skipLabel,
  replayLabel,
  sections,
}: {
  label: string;
  hint: string;
  exitLabel: string;
  skipLabel: string;
  replayLabel: string;
  sections: TourSection[];
}) {
  const [showButton, setShowButton] = useState(false);
  const [touring, setTouring] = useState(false);
  const [step, setStep] = useState(0);
  const [caption, setCaption] = useState("");
  const cancelled = useRef(false);
  const running = useRef(false);

  /* ------------------------------- helpers ------------------------------- */

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const t0 = performance.now();
      const tick = (now: number) => {
        if (cancelled.current || now - t0 >= ms) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

  const glideTo = useCallback(
    (target: number, duration: number) =>
      new Promise<void>((resolve) => {
        const start = window.scrollY;
        const delta = target - start;
        if (Math.abs(delta) < 2) {
          resolve();
          return;
        }
        const t0 = performance.now();
        const step_ = (now: number) => {
          if (cancelled.current) {
            resolve();
            return;
          }
          const t = Math.min(1, (now - t0) / duration);
          window.scrollTo(0, start + delta * easeInOutCubic(t));
          if (t < 1) requestAnimationFrame(step_);
          else resolve();
        };
        requestAnimationFrame(step_);
      }),
    [],
  );

  const centerOf = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const max = document.body.scrollHeight - window.innerHeight;
    const wanted = top + rect.height / 2 - window.innerHeight / 2;
    return Math.max(0, Math.min(max, wanted));
  };

  /* -------------------------------- the tour ------------------------------ */

  const runTour = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    cancelled.current = false;
    setTouring(true);
    setShowButton(false);
    setStep(0);
    document.body.classList.add("is-touring");

    const block = (e: Event) => e.preventDefault();
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelled.current = true;
      else e.preventDefault();
    };
    window.addEventListener("wheel", block, { passive: false });
    window.addEventListener("touchmove", block, { passive: false });
    window.addEventListener("keydown", keys, { passive: false });

    // Reduced motion keeps the guided stops, it only removes the gliding.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const travel = reduced ? 0 : TRAVEL;

    // bottom → top, one section at a time
    const stops = [...sections].reverse();

    try {
      // 1. fall all the way down
      setCaption(stops[0]?.label ?? "");
      await glideTo(
        document.body.scrollHeight - window.innerHeight,
        reduced ? 0 : DIVE,
      );
      if (!cancelled.current) await sleep(HOLD_BOTTOM);

      // 2. climb back up, pausing on every section
      for (let i = 0; i < stops.length; i++) {
        if (cancelled.current) break;
        const y = centerOf(stops[i].id);
        if (y === null) continue;
        setStep(i + 1);
        setCaption(stops[i].label);
        await glideTo(y, travel);
        if (cancelled.current) break;
        await sleep(HOLD);
      }

      // 3. land softly at the top
      setCaption("");
      await glideTo(0, cancelled.current ? 700 : reduced ? 0 : CLIMB_HOME);
      await sleep(220);
    } finally {
      window.removeEventListener("wheel", block);
      window.removeEventListener("touchmove", block);
      window.removeEventListener("keydown", keys);
      document.body.classList.remove("is-touring");
      setTouring(false);
      setCaption("");
      setStep(0);
      running.current = false;
      setShowButton(true);
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {}
    }
  }, [glideTo, sections]);

  /* ------------------ auto-start once, right after loading ---------------- */

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tour") === "0") return;
    const forced = params.get("tour") === "1";

    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    if (seen && !forced) return;

    let stop = false;
    let timer = 0;
    let unlockedAt = 0;
    let tries = 0;

    // Waits for the preloader to hand over, then starts by itself.
    const attempt = () => {
      if (stop || running.current) return;
      tries++;

      const locked = document.body.classList.contains("is-locked");
      const scrollable = document.body.scrollHeight - window.innerHeight > 400;

      if (locked || !scrollable) {
        unlockedAt = 0;
      } else if (!unlockedAt) {
        unlockedAt = performance.now();
      } else if (performance.now() - unlockedAt > 1300) {
        if (window.scrollY < 260 || forced) runTour();
        return;
      }

      if (tries < 90) timer = window.setTimeout(attempt, 400);
    };

    timer = window.setTimeout(attempt, 800);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [runTour]);

  /* --------------- the replay button, revealed while scrolling ------------ */

  useEffect(() => {
    const onScroll = () => {
      if (running.current) return;
      if (window.scrollY > 240) setShowButton(true);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    // manual trigger: window.dispatchEvent(new Event("pf:tour"))
    const manual = () => runTour();
    window.addEventListener("pf:tour", manual);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pf:tour", manual);
    };
  }, [runTour]);

  const total = sections.length;

  return (
    <>
      <AnimatePresence>
        {showButton && !touring && (
          <motion.button
            type="button"
            onClick={runTour}
            initial={{ opacity: 0, y: 26, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.92 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="group fixed bottom-6 end-6 z-50 flex items-center gap-3 rounded-full border border-white/12 bg-white/[0.06] py-2.5 pe-5 ps-2.5 backdrop-blur-xl"
            aria-label={replayLabel}
          >
            <span className="relative grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
              <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-20" />
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="relative h-4 w-4 text-ink"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
              </svg>
            </span>
            <span className="text-start leading-tight">
              <span className="block text-[13px] font-bold text-white">
                {label}
              </span>
              <span className="block text-[10px] text-white/45">{hint}</span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {touring && (
          <>
            <motion.div
              className="tour-bar is-top"
              initial={{ y: "-100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-100%" }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
            <motion.div
              className="tour-bar is-bottom"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />

            {/* top HUD — section name + counter */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.35 }}
              className="tour-hud pointer-events-none fixed inset-x-0 top-0 z-[66] flex h-[9vh] min-h-[54px] items-center justify-between gap-4 px-6"
            >
              <span className="font-mono text-[10px] tracking-[0.35em] text-white/45 uppercase">
                {exitLabel}
              </span>

              <div className="flex items-center gap-3">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={caption}
                    initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    className="text-[15px] font-black tracking-tight text-white sm:text-lg"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {caption}
                  </motion.span>
                </AnimatePresence>
                {step > 0 && (
                  <span className="font-mono text-[10px] text-white/40">
                    {step}/{total}
                  </span>
                )}
              </div>
            </motion.div>

            {/* bottom HUD — step dots + skip */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.35 }}
              className="tour-hud fixed inset-x-0 bottom-0 z-[67] flex h-[9vh] min-h-[54px] items-center justify-between gap-4 px-6"
            >
              <div className="flex items-center gap-1.5">
                {sections.map((s, i) => (
                  <span
                    key={s.id}
                    className={`h-1 rounded-full transition-all duration-500 ${
                      i < step
                        ? "w-6 bg-[var(--accent)]"
                        : "w-2 bg-white/20"
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => (cancelled.current = true)}
                className="rounded-full border border-white/15 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-white/70 transition hover:border-white/40 hover:text-white"
              >
                {skipLabel}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
