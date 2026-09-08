import { PageHeader } from "@/components/admin/PageHeader";
import DatabasePanel from "@/components/admin/DatabasePanel";
import { BACKUP_TABLES, getDbInfo, query } from "@/lib/db";

export const dynamic = "force-dynamic";

const ALL_TABLES = ["users", ...BACKUP_TABLES] as const;

async function tableCounts() {
  const out: Array<{ table: string; count: number | null }> = [];
  for (const table of ALL_TABLES) {
    try {
      const rows = await query<{ c: string }>(
        `SELECT count(*)::text AS c FROM ${table}`,
      );
      out.push({ table, count: Number(rows[0]?.c ?? 0) });
    } catch {
      out.push({ table, count: null });
    }
  }
  return out;
}

export default async function DatabasePage() {
  const [info, counts] = await Promise.all([getDbInfo(), tableCounts()]);
  const isEmbedded = info.driver === "pglite";

  return (
    <>
      <PageHeader
        title="Database"
        desc="Connection status, backups and migrations."
      />

      <section className="mb-5 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 p-5">
          <div className="flex items-center gap-3">
            <span
              className={`grid h-10 w-10 place-items-center rounded-xl ${
                isEmbedded
                  ? "bg-amber-400/12 text-amber-300"
                  : "bg-emerald-400/12 text-emerald-300"
              }`}
            >
              ●
            </span>
            <div>
              <p className="text-sm font-bold text-white">
                {isEmbedded ? "Embedded database (development)" : "PostgreSQL — connected"}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-white/40">
                {info.host}
                {info.database ? ` / ${info.database}` : ""}
                {info.ssl ? " · SSL" : ""}
              </p>
            </div>
          </div>
          <span className="rounded-lg border border-white/10 px-3 py-1.5 font-mono text-[11px] text-white/50">
            {info.version}
          </span>
        </div>

        {isEmbedded && (
          <div className="border-b border-white/8 bg-amber-400/[0.04] p-5 text-xs leading-6 text-amber-200/80">
            You&apos;re running on the local embedded database stored in{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5">.data/pgdata</code>.
            It is perfect for development, but serverless hosting has a read-only
            filesystem — set <code className="rounded bg-black/30 px-1.5 py-0.5">DATABASE_URL</code>{" "}
            (Supabase / Neon / Vercel Postgres) before deploying, then run{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5">npm run db:copy-local</code>{" "}
            to move this content over.
          </div>
        )}

        <ul className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-4">
          {counts.map((c) => (
            <li key={c.table} className="bg-ink/60 p-4">
              <p className="font-mono text-[11px] uppercase tracking-wider text-white/35">
                {c.table}
              </p>
              <p className="mt-1 text-xl font-black text-white">
                {c.count === null ? (
                  <span className="text-rose-300">missing</span>
                ) : (
                  c.count
                )}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <DatabasePanel />
    </>
  );
}
