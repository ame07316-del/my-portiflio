"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type TourSection = { id: string; label: string };

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

export default function QuickTour({
  label,
  hint,
  exitLabel,
  sections,
}: {
  label: string;
  hint: string;
  exitLabel: string;
  sections: TourSection[];
}) {
  const [visible, setVisible] = useState(false);
  const [touring, setTouring] = useState(false);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState(0);
  const cancelled = useRef(false);
  const touringRef = useRef(false);

  /* the button only appears once the visitor starts scrolling */
  useEffect(() => {
    const onScroll = () => {
      if (touringRef.current) return;
      setVisible(window.scrollY > 240);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const captionFor = useCallback(
    (y: number) => {
      const center = y + window.innerHeight / 2;
      let best = "";
      let bestDist = Infinity;
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        const mid = top + rect.height / 2;
        const dist = Math.abs(mid - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = s.label;
        }
      }
      return best;
    },
    [sections],
  );

  const scrollTo = useCallback(
    (target: number, duration: number, ease: (t: number) => number) =>
      new Promise<void>((resolve) => {
        const start = window.scrollY;
        const delta = target - start;
        if (Math.abs(delta) < 2 || duration <= 0) {
          window.scrollTo(0, target);
          resolve();
          return;
        }
        const t0 = performance.now();
        let lastCaption = 0;

        const step = (now: number) => {
          if (cancelled.current) {
            resolve();
            return;
          }
          const t = Math.min(1, (now - t0) / duration);
          const y = start + delta * ease(t);
          window.scrollTo(0, y);

          const max = document.body.scrollHeight - window.innerHeight;
          setProgress(max > 0 ? 1 - y / max : 0);
          if (now - lastCaption > 160) {
            lastCaption = now;
            setCaption(captionFor(y));
          }

          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    [captionFor],
  );

  const runTour = useCallback(async () => {
    if (touringRef.current) return;
    touringRef.current = true;
    cancelled.current = false;
    setTouring(true);
    setVisible(false);
    document.body.classList.add("is-touring");

    const block = (e: Event) => e.preventDefault();
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelled.current = true;
      else e.preventDefault();
    };
    window.addEventListener("wheel", block, { passive: false });
    window.addEventListener("touchmove", block, { passive: false });
    window.addEventListener("keydown", keys, { passive: false });

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const max = () => document.body.scrollHeight - window.innerHeight;

    try {
      // 1. dive to the very bottom
      await scrollTo(max(), reduced ? 0 : 1500, easeInOutCubic);
      await new Promise((r) => setTimeout(r, reduced ? 0 : 420));
      // 2. cinematic climb all the way back up
      await scrollTo(0, reduced ? 0 : 7600, easeInOutSine);
      // 3. settle at the top
      if (cancelled.current) await scrollTo(0, 650, easeInOutCubic);
      await new Promise((r) => setTimeout(r, 260));
    } finally {
      window.removeEventListener("wheel", block);
      window.removeEventListener("touchmove", block);
      window.removeEventListener("keydown", keys);
      document.body.classList.remove("is-touring");
      setTouring(false);
      setCaption("");
      setProgress(0);
      touringRef.current = false;
      setVisible(window.scrollY > 240);
    }
  }, [scrollTo]);

  return (
    <>
      {/* the hidden button — revealed by scrolling */}
      <AnimatePresence>
        {visible && !touring && (
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
            aria-label={label}
          >
            <span className="relative grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
              <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-25" />
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="relative h-4 w-4 text-ink"
              >
                <path d="M12 5v14M6 13l6 6 6-6" />
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

      {/* cinematic frame while the tour is running */}
      <AnimatePresence>
        {touring && (
          <>
            <motion.div
              className="tour-bar is-top"
              initial={{ y: "-100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-100%" }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            />
            <motion.div
              className="tour-bar is-bottom"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            />

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="tour-hud pointer-events-none fixed inset-x-0 bottom-0 z-[66] flex h-[9vh] min-h-[54px] items-center justify-between gap-4 px-6"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/45">
                {exitLabel}
              </span>

              <div className="flex items-center gap-3">
                <div className="h-px w-24 overflow-hidden bg-white/15 sm:w-48">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <span
                  className="min-w-24 text-end text-[13px] font-bold text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {caption}
                </span>
              </div>
            </motion.div>

            <button
              type="button"
              onClick={() => (cancelled.current = true)}
              className="fixed inset-0 z-[64] cursor-pointer"
              aria-label={exitLabel}
              tabIndex={-1}
            />
          </>
        )}
      </AnimatePresence>
    </>
  );
}
