"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

export function Reveal({
  children,
  delay = 0,
  y = 26,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.75, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeading({
  label,
  title,
  subtitle,
  center = false,
}: {
  label: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}) {
  return (
    <Reveal className={center ? "text-center" : ""}>
      <div
        className={`flex items-center gap-3 ${center ? "justify-center" : ""}`}
      >
        <span className="h-px w-8 bg-gradient-to-r from-transparent to-[var(--accent)]" />
        <span className="font-mono text-[11px] uppercase tracking-[0.35em] text-[var(--accent)]">
          {label}
        </span>
      </div>
      <h2
        className="mt-4 text-3xl leading-[1.15] font-black tracking-tight sm:text-5xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={`mt-4 max-w-2xl text-base text-white/55 ${center ? "mx-auto" : ""}`}
        >
          {subtitle}
        </p>
      )}
    </Reveal>
  );
}
