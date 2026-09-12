"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  maxScroll,
  runGuidedTour,
  scrollTop,
  type TourStop,
} from "@/lib/tour";

const SEEN_KEY = "pf_tour_v3";

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
  sections: TourStop[];
}) {
  const [showButton, setShowButton] = useState(false);
  const [touring, setTouring] = useState(false);
  const [step, setStep] = useState(0);
  const [caption, setCaption] = useState("");
  const [debug, setDebug] = useState<string>("");

  const cancelled = useRef(false);
  const running = useRef(false);
  const startedAt = useRef(0);
  const debugOn = useRef(false);

  const log = useCallback((msg: string) => {
    if (!debugOn.current) return;
    console.info("[tour]", msg);
    setDebug((d) => `${msg}\n${d}`.split("\n").slice(0, 6).join("\n"));
  }, []);

  /* -------------------------------- the tour ------------------------------ */

  const runTour = useCallback(async () => {
    // a dead run must never block a new one: `is-touring` is the liveness flag
    if (running.current) {
      if (document.body.classList.contains("is-touring")) {
        log("already running — ignored");
        return;
      }
      running.current = false; // stale, recover
    }
    running.current = true;
    startedAt.current = Date.now();
    cancelled.current = false;
    setTouring(true);
    setShowButton(false);
    setStep(0);
    document.body.classList.add("is-touring");
    log(`start · y=${Math.round(scrollTop())} max=${Math.round(maxScroll())}`);

    const block = (e: Event) => e.preventDefault();
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelled.current = true;
    };
    window.addEventListener("wheel", block, { passive: false });
    window.addEventListener("touchmove", block, { passive: false });
    window.addEventListener("keydown", keys);

    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    try {
      await runGuidedTour(
        sections,
        () => cancelled.current,
        {
          onStep: (i, stop) => {
            setStep(i);
            setCaption(stop?.label ?? "");
            if (stop) log(`${i}/${sections.length} → ${stop.id}`);
          },
        },
        {},
        instant,
      );
    } catch (err) {
      log(`error: ${String(err)}`);
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
      log("done");
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {}
    }
  }, [sections, log]);

  /* ------------------ auto-start once, right after loading ---------------- */

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    debugOn.current = params.get("debug") === "tour";
    if (debugOn.current) setDebug("debug on");
    if (params.get("tour") === "0") return;
    const forced = params.get("tour") === "1";

    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    if (seen && !forced) {
      const t = window.setTimeout(() => setShowButton(true), 0);
      return () => window.clearTimeout(t);
    }

    let stop = false;
    let timer = 0;
    let unlockedAt = 0;
    let tries = 0;

    const attempt = () => {
      if (stop || running.current) return;
      tries++;
      const locked = document.body.classList.contains("is-locked");
      const scrollable = maxScroll() > 400;

      if (locked || !scrollable) unlockedAt = 0;
      else if (!unlockedAt) unlockedAt = performance.now();
      else if (performance.now() - unlockedAt > 1300) {
        if (scrollTop() < 260 || forced) runTour();
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

  /* --------------------------- the replay button -------------------------- */

  useEffect(() => {
    const onScroll = () => {
      if (!running.current && scrollTop() > 240) setShowButton(true);
    };
    onScroll();
    const manual = () => runTour();
    window.addEventListener("scroll", onScroll, { passive: true });
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
            // pointerdown fires even if something swallows the click event;
            // a second call is ignored by the guard inside runTour()
            onPointerDown={() => runTour()}
            initial={{ opacity: 0, y: 26, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.92 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="group pointer-events-auto fixed bottom-6 end-6 z-[90] flex cursor-pointer items-center gap-3 rounded-full border border-white/12 bg-white/[0.06] py-2.5 pe-5 ps-2.5 backdrop-blur-xl"
            aria-label={replayLabel}
            data-tour-button
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
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
            <motion.div
              className="tour-bar is-bottom"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.3 }}
              className="tour-hud pointer-events-none fixed inset-x-0 top-0 z-[86] flex h-[9vh] min-h-[54px] items-center justify-between gap-4 px-6"
            >
              <span className="font-mono text-[10px] tracking-[0.35em] text-white/45 uppercase">
                {exitLabel}
              </span>
              <div className="flex items-center gap-3">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={caption || "intro"}
                    initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
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

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.3 }}
              className="tour-hud fixed inset-x-0 bottom-0 z-[87] flex h-[9vh] min-h-[54px] items-center justify-between gap-4 px-6"
            >
              <div className="flex items-center gap-1.5">
                {sections.map((s, i) => (
                  <span
                    key={s.id}
                    className={`h-1 rounded-full transition-all duration-500 ${
                      i < step ? "w-6 bg-[var(--accent)]" : "w-2 bg-white/20"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  cancelled.current = true;
                }}
                className="cursor-pointer rounded-full border border-white/15 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-white/70 transition hover:border-white/40 hover:text-white"
              >
                {skipLabel}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {debug && (
        <pre className="fixed bottom-2 start-2 z-[95] max-w-[70vw] rounded-lg bg-black/80 p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap text-emerald-300">
          {debug}
        </pre>
      )}
    </>
  );
}
