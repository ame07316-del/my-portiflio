"use client";

import { useActionState, useState } from "react";
import { deleteService, saveService, type FormState } from "@/app/admin/actions";
import {
  Card,
  IconButton,
  Input,
  Select,
  SubmitButton,
  Textarea,
} from "@/components/admin/ui";
import type { Service } from "@/lib/types";

const initial: FormState = {};
const iconOptions = ["code", "layers", "dashboard", "cube", "bolt"];

function Fields({ s }: { s?: Service }) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <Input label="Title (EN)" name="title_en" defaultValue={s?.title_en} />
      <Input label="Title (AR)" name="title_ar" defaultValue={s?.title_ar} dir="rtl" />
      <Textarea label="Description (EN)" name="desc_en" defaultValue={s?.desc_en} />
      <Textarea label="Description (AR)" name="desc_ar" defaultValue={s?.desc_ar} dir="rtl" />
      <Select label="Icon" name="icon" defaultValue={s?.icon ?? "code"}>
        {iconOptions.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </Select>
      <Input label="Sort" name="sort" type="number" defaultValue={s?.sort ?? 99} />
    </div>
  );
}

function ServiceRow({ service }: { service: Service }) {
  const [state, action] = useActionState(saveService, initial);
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-white/8 bg-white/[0.02]">
      <div className="flex items-center justify-between gap-3 p-3.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/6 font-mono text-[10px] text-[var(--accent)]">
            {service.icon.slice(0, 2)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">
              {service.title_en}
            </span>
            <span className="block truncate text-xs text-white/35" dir="rtl">
              {service.title_ar}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70"
          >
            {open ? "Close" : "Edit"}
          </button>
          <form action={deleteService}>
            <input type="hidden" name="id" value={service.id} />
            <IconButton variant="danger" title="Delete">
              ✕
            </IconButton>
          </form>
        </div>
      </div>
      {open && (
        <form action={action} className="border-t border-white/8 p-3.5">
          <input type="hidden" name="id" value={service.id} />
          <Fields s={service} />
          <div className="mt-4">
            <SubmitButton pendingLabel="Saving…">
              {state.ok ? "Saved ✓" : "Save service"}
            </SubmitButton>
          </div>
        </form>
      )}
    </li>
  );
}

export default function ServicesManager({ services }: { services: Service[] }) {
  const [state, action] = useActionState(saveService, initial);
  const [key, setKey] = useState(0);

  return (
    <div className="space-y-5">
      <Card title="Add a service">
        <form
          key={key}
          action={async (fd) => {
            await action(fd);
            setKey((k) => k + 1);
          }}
        >
          <Fields />
          <div className="mt-4">
            <SubmitButton pendingLabel="Adding…">+ Add service</SubmitButton>
          </div>
          {state.error && (
            <p className="mt-3 text-xs text-rose-300">Add at least one title.</p>
          )}
        </form>
      </Card>

      <Card title={`Services (${services.length})`}>
        <ul className="space-y-2.5">
          {services.map((s) => (
            <ServiceRow key={s.id} service={s} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
