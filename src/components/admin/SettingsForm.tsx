"use client";

import { useActionState } from "react";
import { saveSettings, type FormState } from "@/app/admin/actions";
import {
  Alert,
  Card,
  Input,
  SubmitButton,
  Textarea,
  Toggle,
} from "@/components/admin/ui";
import type { Settings } from "@/lib/types";

const initial: FormState = {};

export default function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action] = useActionState(saveSettings, initial);
  const s = settings;

  return (
    <form action={action} className="space-y-5">
      <Card title="Identity" desc="Shown in the hero, nav and footer.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name (EN)" name="name_en" defaultValue={s.name_en} />
          <Input label="Name (AR)" name="name_ar" defaultValue={s.name_ar} dir="rtl" />
          <Input label="Job title (EN)" name="role_en" defaultValue={s.role_en} />
          <Input label="Job title (AR)" name="role_ar" defaultValue={s.role_ar} dir="rtl" />
          <Textarea label="Hero tagline (EN)" name="tagline_en" defaultValue={s.tagline_en} />
          <Textarea
            label="Hero tagline (AR)"
            name="tagline_ar"
            defaultValue={s.tagline_ar}
            dir="rtl"
          />
          <Textarea
            label="About text (EN)"
            name="about_en"
            defaultValue={s.about_en}
            className="sm:col-span-1"
          />
          <Textarea
            label="About text (AR)"
            name="about_ar"
            defaultValue={s.about_ar}
            dir="rtl"
          />
        </div>
      </Card>

      <Card title="Contact & social">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Email" name="email" type="email" defaultValue={s.email} />
          <Input label="Phone" name="phone" defaultValue={s.phone} />
          <Input label="Location (EN)" name="location_en" defaultValue={s.location_en} />
          <Input
            label="Location (AR)"
            name="location_ar"
            defaultValue={s.location_ar}
            dir="rtl"
          />
          <Input label="GitHub URL" name="github" defaultValue={s.github} />
          <Input label="LinkedIn URL" name="linkedin" defaultValue={s.linkedin} />
          <Input label="X / Twitter URL" name="twitter" defaultValue={s.twitter} />
          <Input
            label="WhatsApp number"
            name="whatsapp"
            defaultValue={s.whatsapp}
            hint="Digits only, with country code — e.g. 201000000000"
          />
          <Input
            label="CV / Resume link"
            name="resume_url"
            defaultValue={s.resume_url}
            className="sm:col-span-2"
          />
        </div>
      </Card>

      <Card title="Numbers & availability">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Years of experience" name="years" type="number" defaultValue={s.years} />
          <Input
            label="Projects delivered"
            name="projects_done"
            type="number"
            defaultValue={s.projects_done}
          />
          <Input label="Happy clients" name="clients" type="number" defaultValue={s.clients} />
          <Toggle label="Available for work" name="available" defaultChecked={s.available} />
        </div>
      </Card>

      <Card title="Theme" desc="These two colors drive the whole site and the 3D scenes.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
              Primary accent
            </span>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <input
                type="color"
                name="accent"
                defaultValue={s.accent}
                className="h-9 w-14 cursor-pointer rounded-lg bg-transparent"
              />
              <span className="font-mono text-xs text-white/50">{s.accent}</span>
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
              Secondary accent
            </span>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <input
                type="color"
                name="accent2"
                defaultValue={s.accent2}
                className="h-9 w-14 cursor-pointer rounded-lg bg-transparent"
              />
              <span className="font-mono text-xs text-white/50">{s.accent2}</span>
            </div>
          </label>
        </div>
      </Card>

      {state.ok && <Alert>Settings saved — the live site is already updated.</Alert>}

      <div className="sticky bottom-4 flex justify-end">
        <div className="rounded-2xl border border-white/10 bg-ink/85 p-2 backdrop-blur">
          <SubmitButton pendingLabel="Saving…">Save all settings</SubmitButton>
        </div>
      </div>
    </form>
  );
}
