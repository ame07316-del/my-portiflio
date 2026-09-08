"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** deterministic PRNG — no Math.random during render (React Compiler safe) */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Shift = { id: number; to: "day" | "night" };

const ENTER_DAY = 0.58;
const ENTER_NIGHT = 0.42;

export default function WorldShift({
  dayLabel = "Daylight",
  nightLabel = "Nightfall",
}: {
  dayLabel?: string;
  nightLabel?: string;
}) {
  const [shift, setShift] = useState<Shift | null>(null);
  const isDay = useRef(false);
  const busy = useRef(false);
  const raf = useRef(0);

  const stars = useMemo(() => {
    const rnd = prng(20260908);
    return Array.from({ length: 110 }, (_, i) => ({
      id: i,
      x: rnd() * 100,
      y: rnd() * 78,
      size: 0.8 + rnd() * 1.9,
      alpha: 0.25 + rnd() * 0.75,
      dur: 2.2 + rnd() * 4.5,
    }));
  }, []);

  const streaks = useMemo(
    () => Array.from({ length: 14 }, (_, i) => (i * 360) / 14 + (i % 2 ? 7 : 0)),
    [],
  );

  useEffect(() => {
    const root = document.documentElement;
    let recheck = 0;

    const flip = (to: "day" | "night") => {
      if (busy.current) return;
      busy.current = true;
      isDay.current = to === "day";
      const id = Date.now();
      setShift({ id, to });

      // the screen is fully covered by the flash at ~58% of the 1.7s timeline
      window.setTimeout(() => {
        root.classList.toggle("day", to === "day");
        window.dispatchEvent(
          new CustomEvent("pf:world", { detail: { day: to === "day" } }),
        );
      }, 950);

      window.setTimeout(() => {
        setShift(null);
        busy.current = false;
        // the viewport may have moved past another threshold meanwhile
        recheck = window.setTimeout(measure, 60);
      }, 1750);
    };

    const measure = () => {
      raf.current = 0;
      const max = document.body.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      // dawn starts at 18% of the page and completes around 55%
      const dayp = Math.min(1, Math.max(0, (p - 0.18) / 0.37));
      root.style.setProperty("--dayp", dayp.toFixed(3));

      if (!isDay.current && dayp > ENTER_DAY) flip("day");
      else if (isDay.current && dayp < ENTER_NIGHT) flip("night");
    };

    const onScroll = () => {
      if (!raf.current) raf.current = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
      window.clearTimeout(recheck);
      root.classList.remove("day");
      root.style.removeProperty("--dayp");
    };
  }, []);

  return (
    <>
      <div className="sky-stage" aria-hidden>
        <div className="sky-night" />
        {stars.map((s) => (
          <span
            key={s.id}
            className="sky-star"
            style={
              {
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: s.size,
                height: s.size,
                "--s": s.alpha,
                "--d": `${s.dur}s`,
              } as React.CSSProperties
            }
          />
        ))}
        <div className="sky-moon" />
        <div className="sky-day" />
        <div className="sky-sun" />
        <div className="sky-horizon" />
      </div>

      {shift && (
        <div
          key={shift.id}
          className="world-shift"
          aria-hidden
          style={
            {
              "--ws-a": shift.to === "day" ? "#ffc46b" : "#7dd3fc",
              "--ws-b": shift.to === "day" ? "#b46b2a" : "#3b1d7a",
            } as React.CSSProperties
          }
        >
          {streaks.map((r) => (
            <span
              key={r}
              className="ws-streak"
              style={{ "--r": `${r}deg` } as React.CSSProperties}
            />
          ))}
          <div className="ws-planet" />
          <div className="ws-flash" />
          <span className="ws-label">
            {shift.to === "day" ? dayLabel : nightLabel}
          </span>
        </div>
      )}
    </>
  );
}
