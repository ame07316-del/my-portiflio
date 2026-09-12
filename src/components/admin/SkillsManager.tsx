"use client";

import { useActionState, useState } from "react";
import { deleteSkill, saveSkill, type FormState } from "@/app/admin/actions";
import { Card, IconButton, Input, Select, SubmitButton } from "@/components/admin/ui";
import type { Skill } from "@/lib/types";

const initial: FormState = {};
const categories = ["frontend", "backend", "design", "tools"];

function SkillRow({ skill }: { skill: Skill }) {
  const [state, action] = useActionState(saveSkill, initial);
  return (
    <li className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-end gap-2.5">
        <form action={action} className="flex flex-1 flex-wrap items-end gap-2.5">
          <input type="hidden" name="id" value={skill.id} />
          <Input
            name="name"
            defaultValue={skill.name}
            className="min-w-[160px] flex-[2]"
            label="Name"
          />
          <Input
            name="level"
            type="number"
            min={0}
            max={100}
            defaultValue={skill.level}
            className="w-24"
            label="Level"
          />
          <Select
            name="category"
            defaultValue={skill.category}
            className="w-36"
            label="Category"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input
            name="sort"
            type="number"
            defaultValue={skill.sort}
            className="w-20"
            label="Sort"
          />
          <SubmitButton variant="ghost" pendingLabel="…">
            {state.ok ? "Saved ✓" : "Save"}
          </SubmitButton>
        </form>
        <form action={deleteSkill}>
          <input type="hidden" name="id" value={skill.id} />
          <IconButton variant="danger" title="Delete">
            ✕
          </IconButton>
        </form>
      </div>
    </li>
  );
}

export default function SkillsManager({ skills }: { skills: Skill[] }) {
  const [state, action] = useActionState(saveSkill, initial);
  const [key, setKey] = useState(0);

  return (
    <div className="space-y-5">
      <Card title="Add a skill" desc="Shown in the Capabilities section with a progress bar.">
        <form
          key={key}
          action={async (fd) => {
            await action(fd);
            setKey((k) => k + 1);
          }}
          className="flex flex-wrap items-end gap-2.5"
        >
          <Input
            name="name"
            label="Name"
            placeholder="Next.js"
            required
            className="min-w-[180px] flex-[2]"
          />
          <Input
            name="level"
            label="Level"
            type="number"
            min={0}
            max={100}
            defaultValue={85}
            className="w-24"
          />
          <Select name="category" label="Category" className="w-36">
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input name="sort" label="Sort" type="number" defaultValue={99} className="w-20" />
          <SubmitButton pendingLabel="Adding…">+ Add skill</SubmitButton>
        </form>
        {state.error && (
          <p className="mt-3 text-xs text-rose-300">Please enter a name.</p>
        )}
      </Card>

      <Card title={`Your skills (${skills.length})`}>
        <ul className="space-y-2.5">
          {skills.map((s) => (
            <SkillRow key={s.id} skill={s} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
