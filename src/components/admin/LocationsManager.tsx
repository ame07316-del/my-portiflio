"use client";

import { useActionState, useState } from "react";
import { deleteLocation, saveLocation, type FormState } from "@/app/admin/actions";
import { Card, IconButton, Input, SubmitButton, Toggle } from "@/components/admin/ui";
import type { GlobeLocation } from "@/lib/types";

const initial: FormState = {};

const PRESETS: Array<{ label: string; lat: number; lng: number }> = [
  { label: "Cairo", lat: 30.0444, lng: 31.2357 },
  { label: "Dubai", lat: 25.2048, lng: 55.2708 },
  { label: "Riyadh", lat: 24.7136, lng: 46.6753 },
  { label: "Jeddah", lat: 21.4858, lng: 39.1925 },
  { label: "Doha", lat: 25.2854, lng: 51.531 },
  { label: "Kuwait City", lat: 29.3759, lng: 47.9774 },
  { label: "Istanbul", lat: 41.0082, lng: 28.9784 },
  { label: "London", lat: 51.5074, lng: -0.1278 },
  { label: "Paris", lat: 48.8566, lng: 2.3522 },
  { label: "Berlin", lat: 52.52, lng: 13.405 },
  { label: "New York", lat: 40.7128, lng: -74.006 },
  { label: "Toronto", lat: 43.6532, lng: -79.3832 },
  { label: "Singapore", lat: 1.3521, lng: 103.8198 },
  { label: "Sydney", lat: -33.8688, lng: 151.2093 },
];

function Fields({
  l,
  preset,
}: {
  l?: GlobeLocation;
  preset?: { lat: number; lng: number; label: string };
}) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      <Input
        label="City (EN)"
        name="label_en"
        defaultValue={l?.label_en ?? preset?.label}
        key={`en-${preset?.label ?? l?.id ?? "new"}`}
        required
      />
      <Input label="City (AR)" name="label_ar" defaultValue={l?.label_ar} dir="rtl" />
      <Input
        label="Latitude"
        name="lat"
        type="number"
        step="any"
        key={`lat-${preset?.lat ?? l?.id ?? "new"}`}
        defaultValue={l?.lat ?? preset?.lat ?? 0}
      />
      <Input
        label="Longitude"
        name="lng"
        type="number"
        step="any"
        key={`lng-${preset?.lng ?? l?.id ?? "new"}`}
        defaultValue={l?.lng ?? preset?.lng ?? 0}
      />
      <Input
        label="Caption"
        name="caption"
        defaultValue={l?.caption}
        placeholder="Client / Home base"
      />
      <Input
        label="Avatar image (optional)"
        name="avatar"
        defaultValue={l?.avatar}
        placeholder="/clients/logo.png"
      />
      <Input label="Sort" name="sort" type="number" defaultValue={l?.sort ?? 99} />
      <Toggle label="Home base" name="is_home" defaultChecked={l?.is_home ?? false} />
    </div>
  );
}

function Row({ location }: { location: GlobeLocation }) {
  const [state, action] = useActionState(saveLocation, initial);
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-white/8 bg-white/[0.02]">
      <div className="flex items-center justify-between gap-3 p-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: location.is_home ? "#e9c98b" : "var(--accent)" }}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {location.label_en}
              {location.is_home && (
                <span className="ms-2 rounded-md bg-[#e9c98b]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#e9c98b]">
                  home
                </span>
              )}
            </p>
            <p className="truncate font-mono text-[11px] text-white/35">
              {Number(location.lat).toFixed(3)}, {Number(location.lng).toFixed(3)}
              {location.caption ? ` · ${location.caption}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70"
          >
            {open ? "Close" : "Edit"}
          </button>
          <form action={deleteLocation}>
            <input type="hidden" name="id" value={location.id} />
            <IconButton variant="danger" title="Delete">
              ✕
            </IconButton>
          </form>
        </div>
      </div>
      {open && (
        <form action={action} className="border-t border-white/8 p-3.5">
          <input type="hidden" name="id" value={location.id} />
          <Fields l={location} />
          <div className="mt-4">
            <SubmitButton pendingLabel="Saving…">
              {state.ok ? "Saved ✓" : "Save location"}
            </SubmitButton>
          </div>
        </form>
      )}
    </li>
  );
}

export default function LocationsManager({
  locations,
}: {
  locations: GlobeLocation[];
}) {
  const [state, action] = useActionState(saveLocation, initial);
  const [preset, setPreset] = useState<(typeof PRESETS)[number] | undefined>();
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="space-y-5">
      <Card
        title="Add a pin to the globe"
        desc="Pick a city preset to fill the coordinates, or type your own."
      >
        <div className="mb-4 flex flex-wrap gap-1.5">
          {PRESETS.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => setPreset(c)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                preset?.label === c.label
                  ? "border-[var(--accent)]/60 bg-[var(--accent)]/10 text-white"
                  : "border-white/10 text-white/55 hover:text-white"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <form
          key={formKey}
          action={async (fd) => {
            await action(fd);
            setPreset(undefined);
            setFormKey((k) => k + 1);
          }}
        >
          <Fields preset={preset} />
          <div className="mt-4">
            <SubmitButton pendingLabel="Adding…">+ Add location</SubmitButton>
          </div>
          {state.error && (
            <p className="mt-3 text-xs text-rose-300">Add a city name first.</p>
          )}
        </form>
      </Card>

      <Card title={`Globe pins (${locations.length})`}>
        <ul className="space-y-2.5">
          {locations.map((l) => (
            <Row key={l.id} location={l} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
