"use client";

import { useActionState, useState } from "react";
import { deleteExperience, saveExperience, type FormState } from "@/app/admin/actions";
import { Card, IconButton, Input, SubmitButton, Textarea } from "@/components/admin/ui";
import type { Experience } from "@/lib/types";

const initial: FormState = {};

function Fields({ e }: { e?: Experience }) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <Input label="Role (EN)" name="role_en" defaultValue={e?.role_en} />
      <Input label="Role (AR)" name="role_ar" defaultValue={e?.role_ar} dir="rtl" />
      <Input label="Company (EN)" name="org_en" defaultValue={e?.org_en} />
      <Input label="Company (AR)" name="org_ar" defaultValue={e?.org_ar} dir="rtl" />
      <Input
        label="Period"
        name="period"
        defaultValue={e?.period}
        placeholder="2024 — Present"
      />
      <Input label="Sort" name="sort" type="number" defaultValue={e?.sort ?? 99} />
      <Textarea label="Description (EN)" name="desc_en" defaultValue={e?.desc_en} />
      <Textarea label="Description (AR)" name="desc_ar" defaultValue={e?.desc_ar} dir="rtl" />
    </div>
  );
}

function Row({ item }: { item: Experience }) {
  const [state, action] = useActionState(saveExperience, initial);
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-white/8 bg-white/[0.02]">
      <div className="flex items-center justify-between gap-3 p-3.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{item.role_en}</p>
          <p className="truncate text-xs text-white/35">
            {item.org_en} · {item.period}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70"
          >
            {open ? "Close" : "Edit"}
          </button>
          <form action={deleteExperience}>
            <input type="hidden" name="id" value={item.id} />
            <IconButton variant="danger" title="Delete">
              ✕
            </IconButton>
          </form>
        </div>
      </div>
      {open && (
        <form action={action} className="border-t border-white/8 p-3.5">
          <input type="hidden" name="id" value={item.id} />
          <Fields e={item} />
          <div className="mt-4">
            <SubmitButton pendingLabel="Saving…">
              {state.ok ? "Saved ✓" : "Save entry"}
            </SubmitButton>
          </div>
        </form>
      )}
    </li>
  );
}

export default function ExperienceManager({ items }: { items: Experience[] }) {
  const [state, action] = useActionState(saveExperience, initial);
  const [key, setKey] = useState(0);

  return (
    <div className="space-y-5">
      <Card title="Add timeline entry">
        <form
          key={key}
          action={async (fd) => {
            await action(fd);
            setKey((k) => k + 1);
          }}
        >
          <Fields />
          <div className="mt-4">
            <SubmitButton pendingLabel="Adding…">+ Add entry</SubmitButton>
          </div>
          {state.error && (
            <p className="mt-3 text-xs text-rose-300">Add a role first.</p>
          )}
        </form>
      </Card>

      <Card title={`Timeline (${items.length})`}>
        <ul className="space-y-2.5">
          {items.map((i) => (
            <Row key={i.id} item={i} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
