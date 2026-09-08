import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { IconButton } from "@/components/admin/ui";
import { deleteProject, moveProject, toggleProjectFlag } from "@/app/admin/actions";
import { getProjects } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await getProjects(false);

  return (
    <>
      <PageHeader
        title="Projects"
        desc="Add, edit, reorder and publish the work shown on your site."
      >
        <Link
          href="/admin/projects/new"
          className="rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-4 py-2.5 text-sm font-bold text-ink"
        >
          + New project
        </Link>
      </PageHeader>

      {projects.length === 0 && (
        <p className="rounded-2xl border border-dashed border-white/12 px-4 py-16 text-center text-sm text-white/40">
          No projects yet — create your first one.
        </p>
      )}

      <ul className="space-y-3">
        {projects.map((p, i) => (
          <li
            key={p.id}
            className="group grid grid-cols-[auto_1fr] gap-4 rounded-2xl border border-white/8 bg-white/[0.025] p-3.5 transition hover:border-white/15 sm:grid-cols-[112px_1fr_auto]"
          >
            <div className="relative h-16 w-24 overflow-hidden rounded-xl bg-white/5 sm:h-[70px] sm:w-[112px]">
              {p.image ? (
                <Image src={p.image} alt="" fill className="object-cover" sizes="112px" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-[var(--accent)]/25 to-[var(--accent-2)]/25" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-bold text-white">{p.title_en}</h3>
                {p.featured && (
                  <span className="rounded-md bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--accent)]">
                    featured
                  </span>
                )}
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    p.published
                      ? "bg-emerald-400/12 text-emerald-300"
                      : "bg-white/8 text-white/40"
                  }`}
                >
                  {p.published ? "live" : "draft"}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-white/40" dir="auto">
                {p.title_ar} · {p.category} · {p.year}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-white/8 px-1.5 py-0.5 font-mono text-[10px] text-white/40"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="col-span-2 flex flex-wrap items-center justify-end gap-1.5 sm:col-span-1">
              <form action={moveProject}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="dir" value="up" />
                <IconButton title="Move up">↑</IconButton>
              </form>
              <form action={moveProject}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="dir" value="down" />
                <IconButton title="Move down">↓</IconButton>
              </form>
              <form action={toggleProjectFlag}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="field" value="featured" />
                <IconButton title="Toggle featured">★</IconButton>
              </form>
              <form action={toggleProjectFlag}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="field" value="published" />
                <IconButton title="Toggle published">
                  {p.published ? "◉" : "○"}
                </IconButton>
              </form>
              {p.live_url && (
                <a
                  href={p.live_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-xs text-white/60 transition hover:border-white/30 hover:text-white"
                  title="Open live site"
                >
                  ↗
                </a>
              )}
              <Link
                href={`/admin/projects/${p.id}`}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/75 transition hover:border-[var(--accent)]/50 hover:text-white"
              >
                Edit
              </Link>
              <form action={deleteProject}>
                <input type="hidden" name="id" value={p.id} />
                <IconButton title="Delete" variant="danger">
                  ✕
                </IconButton>
              </form>
              <span className="ms-1 font-mono text-[10px] text-white/20">
                #{i + 1}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
