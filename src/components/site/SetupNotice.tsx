import { isProductionRuntime } from "@/lib/secret";

/**
 * Shown instead of a crash when the app can't reach a database yet
 * (typically a fresh deploy without DATABASE_URL).
 */
export default function SetupNotice({ message }: { message?: string }) {
  const steps = [
    {
      t: "Create a Postgres database",
      d: "Supabase → New project → copy the Transaction pooler connection string (port 6543).",
    },
    {
      t: "Add the environment variables",
      d: "DATABASE_URL and AUTH_SECRET in Vercel → Settings → Environment Variables.",
    },
    {
      t: "Redeploy",
      d: "The tables and starter content are created automatically on the first request.",
    },
  ];

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-ink px-6 py-16">
      <div className="aurora opacity-70" />
      <div className="grid-bg absolute inset-0 opacity-30 [mask-image:radial-gradient(60%_60%_at_50%_40%,#000,transparent)]" />

      <div className="relative w-full max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.3em] text-amber-300">
          setup required
        </span>

        <h1
          className="mt-6 text-4xl leading-[1.05] font-black tracking-tight sm:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Connect a database
        </h1>
        <p className="mt-4 max-w-xl leading-8 text-white/55">
          The site is deployed, but it has nowhere to store its content yet.
          Serverless hosting has a read-only filesystem, so the local embedded
          database can&apos;t be used here.
        </p>

        <ol className="mt-8 space-y-3">
          {steps.map((s, i) => (
            <li
              key={s.t}
              className="flex gap-4 rounded-2xl border border-white/8 bg-white/[0.025] p-4"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-black text-ink">
                {i + 1}
              </span>
              <span>
                <span className="block text-sm font-bold text-white">{s.t}</span>
                <span className="mt-1 block text-sm leading-6 text-white/50">
                  {s.d}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-ink transition hover:scale-[1.02]"
          >
            Open Supabase ↗
          </a>
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-white/35"
          >
            Vercel settings ↗
          </a>
        </div>

        {/* Raw driver errors can leak hostnames/credentials — dev only. */}
        {message && !isProductionRuntime() && (
          <p className="mt-8 overflow-x-auto rounded-xl border border-white/8 bg-black/40 px-4 py-3 font-mono text-[11px] leading-5 text-white/40">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
