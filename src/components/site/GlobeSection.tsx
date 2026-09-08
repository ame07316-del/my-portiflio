"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Reveal } from "./Reveal";
import type { GlobeMarker } from "@/components/ui/3d-globe";
import type { Dict } from "@/lib/i18n";
import type { GlobeLocation, Lang, Settings } from "@/lib/types";
import { pick } from "@/lib/types";

const Globe3D = dynamic(
  () => import("@/components/ui/3d-globe").then((m) => m.Globe3D),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center">
        <div className="h-56 w-56 animate-pulse rounded-full border border-white/10 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,.08),transparent_60%)]" />
      </div>
    ),
  },
);

export default function GlobeSection({
  dict,
  settings,
  locations,
  lang,
}: {
  dict: Dict;
  settings: Settings;
  locations: GlobeLocation[];
  lang: Lang;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const markers: GlobeMarker[] = useMemo(
    () =>
      locations.map((l) => ({
        id: l.id,
        lat: Number(l.lat),
        lng: Number(l.lng),
        label: pick(l, "label", lang),
        caption: l.caption,
        home: l.is_home,
        src: l.avatar || undefined,
      })),
    [locations, lang],
  );

  if (!locations.length) return null;

  const home = locations.find((l) => l.is_home);

  return (
    <section id="global" className="relative overflow-hidden py-24 sm:py-28">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-1/4 h-[520px] bg-[radial-gradient(45%_50%_at_50%_50%,color-mix(in_oklab,var(--accent)_12%,transparent),transparent)]" />
      </div>

      <div className="container-x grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Reveal>
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-[var(--accent)]" />
              <span className="font-mono text-[11px] uppercase tracking-[0.35em] text-[var(--accent)]">
                {dict.globe.label}
              </span>
            </div>
            <h2
              className="mt-4 text-3xl leading-[1.15] font-black tracking-tight sm:text-5xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {pick(settings, "globe_title", lang)}
            </h2>
            <p className="mt-4 max-w-lg text-base leading-8 text-white/55">
              {pick(settings, "globe_desc", lang)}
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mt-8 grid max-w-md grid-cols-3 gap-4 border-y border-white/10 py-5">
              <div>
                <p
                  className="text-2xl font-black text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {locations.length}
                </p>
                <p className="mt-1 text-[11px] text-white/45">{dict.globe.cities}</p>
              </div>
              <div>
                <p
                  className="text-2xl font-black text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {home ? pick(home, "label", lang) : "—"}
                </p>
                <p className="mt-1 text-[11px] text-white/45">{dict.globe.base}</p>
              </div>
              <div>
                <p
                  className="text-2xl font-black text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  24/7
                </p>
                <p className="mt-1 text-[11px] text-white/45">{dict.globe.timezone}</p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <ul className="mt-6 flex flex-wrap gap-2">
              {locations.map((l) => {
                const label = pick(l, "label", lang);
                const active = hovered === label;
                return (
                  <li
                    key={l.id}
                    onMouseEnter={() => setHovered(label)}
                    onMouseLeave={() => setHovered(null)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                      active || l.is_home
                        ? "border-[color:var(--gold)]/50 bg-[color:var(--gold)]/10 text-white"
                        : "border-white/10 bg-white/[0.03] text-white/55"
                    }`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        background: l.is_home ? "var(--gold)" : "var(--accent)",
                      }}
                    />
                    {label}
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className="relative mx-auto aspect-square w-full max-w-[620px]">
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,color-mix(in_oklab,var(--accent)_10%,transparent),transparent_65%)] blur-2xl" />
            <Globe3D
              markers={markers}
              config={{
                atmosphereColor: settings.accent,
                atmosphereIntensity: 18,
                bumpScale: 5,
                autoRotateSpeed: 0.32,
                landColor: settings.accent,
                landColorAlt: settings.accent2,
                homeColor: settings.globe_color,
                markerColor: "#ffffff",
                globeColor: "#06080f",
              }}
              onMarkerHover={(m) => setHovered(m?.label ?? null)}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
              <span className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40 backdrop-blur">
                {hovered ?? dict.globe.hint}
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
