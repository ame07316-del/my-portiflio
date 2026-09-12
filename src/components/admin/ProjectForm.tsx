"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveProject, type FormState } from "@/app/admin/actions";
import {
  Alert,
  Card,
  Input,
  Select,
  SubmitButton,
  Textarea,
  Toggle,
} from "@/components/admin/ui";
import type { Project } from "@/lib/types";

const initial: FormState = {};

export default function ProjectForm({ project }: { project?: Project }) {
  const [state, action] = useActionState(saveProject, initial);
  const p = project;

  return (
    <form action={action} className="space-y-5">
      {p && <input type="hidden" name="id" value={p.id} />}

      <Card title="Content" desc="Both languages are shown on the public site.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Title (EN)" name="title_en" defaultValue={p?.title_en} required />
          <Input label="Title (AR)" name="title_ar" defaultValue={p?.title_ar} dir="rtl" />
          <Textarea
            label="Short summary (EN)"
            name="summary_en"
            defaultValue={p?.summary_en}
          />
          <Textarea
            label="Short summary (AR)"
            name="summary_ar"
            defaultValue={p?.summary_ar}
            dir="rtl"
          />
          <Textarea
            label="Full description (EN)"
            name="description_en"
            defaultValue={p?.description_en}
          />
          <Textarea
            label="Full description (AR)"
            name="description_ar"
            defaultValue={p?.description_ar}
            dir="rtl"
          />
        </div>
      </Card>

      <Card title="Links & media">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Live URL"
            name="live_url"
            defaultValue={p?.live_url}
            placeholder="https://project.vercel.app/"
          />
          <Input
            label="Admin panel URL"
            name="admin_url"
            defaultValue={p?.admin_url}
            placeholder="https://project.vercel.app/admin"
          />
          <Input label="Repository URL" name="repo_url" defaultValue={p?.repo_url} />
          <Input
            label="Cover image"
            name="image"
            defaultValue={p?.image}
            placeholder="/projects/my-project.png"
            hint="Put files in /public/projects or paste any image URL."
          />
        </div>
      </Card>

      <Card title="Meta">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Slug"
            name="slug"
            defaultValue={p?.slug}
            placeholder="auto from title"
          />
          <Select label="Category" name="category" defaultValue={p?.category ?? "web-app"}>
            <option value="web-app">web-app</option>
            <option value="website">website</option>
            <option value="dashboard">dashboard</option>
            <option value="e-commerce">e-commerce</option>
            <option value="landing">landing</option>
          </Select>
          <Input
            label="Year"
            name="year"
            type="number"
            defaultValue={p?.year ?? new Date().getFullYear()}
          />
          <Input
            label="Tags (comma separated)"
            name="tags"
            defaultValue={p?.tags?.join(", ")}
            className="sm:col-span-2"
            placeholder="Next.js, Tailwind, Dashboard"
          />
          <Input label="Sort order" name="sort" type="number" defaultValue={p?.sort ?? 0} />
          <Toggle label="Featured" name="featured" defaultChecked={p?.featured ?? false} />
          <Toggle
            label="Published"
            name="published"
            defaultChecked={p?.published ?? true}
          />
        </div>
      </Card>

      {state.error && (
        <Alert tone="error">
          {state.error === "SLUG_TAKEN"
            ? "That slug is already used by another project."
            : "Please add a title first."}
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…">
          {p ? "Save changes" : "Create project"}
        </SubmitButton>
        <Link
          href="/admin/projects"
          className="rounded-xl border border-white/12 px-4 py-2.5 text-sm text-white/60 transition hover:border-white/30"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
