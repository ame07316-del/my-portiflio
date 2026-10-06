import { diagnoseDbError } from "@/lib/diagnose";

/**
 * Shown instead of a crash when the app can't reach the database yet.
 *
 * The raw driver error/cause chain is classified by `diagnoseDbError`, which
 * strips credentials, connection strings, usernames, hosts, PEM blocks and
 * sensitive paths — only a safe technical code, bilingual diagnosis and fix
 * steps reach the page (production included).
 */
export default function SetupNotice({
  error,
  message,
}: {
  error?: unknown;
  message?: string;
}) {
  const input = error !== undefined ? error : message;
  const d = diagnoseDbError(input);

  const isSetup = d.code === "missing-url";
  const accent = isSetup
    ? {
        badge:
          "border-amber-400/25 bg-amber-400/10 text-amber-300",
        chip: "bg-amber-400/10 text-amber-300 border-amber-400/25",
        number: "from-amber-300 to-orange-400",
      }
    : {
        badge: "border-red-400/25 bg-red-400/10 text-red-300",
        chip: "bg-red-400/10 text-red-300 border-red-400/25",
        number: "from-red-400 to-orange-500",
      };

  return (
    <main
      dir="ltr"
      className="relative grid min-h-screen place-items-center overflow-hidden bg-ink px-6 py-16"
    >
      <div className="aurora opacity-70" />
      <div className="grid-bg absolute inset-0 opacity-30 [mask-image:radial-gradient(60%_60%_at_50%_40%,#000,transparent)]" />

      <div className="relative w-full max-w-2xl">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.3em] ${accent.badge}`}
          >
            {isSetup ? "setup required" : "connection failed"}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1.5 font-mono text-[11px] tracking-wider ${accent.chip}`}
          >
            {d.technical}
          </span>
        </div>

        <h1
          className="mt-6 text-4xl leading-[1.05] font-black tracking-tight sm:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {d.title.en}
        </h1>
        <p dir="rtl" className="mt-3 text-xl leading-8 font-bold text-white/75">
          {d.title.ar}
        </p>

        <p className="mt-4 max-w-xl leading-8 text-white/55">{d.summary.en}</p>
        <p dir="rtl" className="mt-2 max-w-xl leading-8 text-white/45">
          {d.summary.ar}
        </p>

        {d.detail && (
          <div className="mt-6">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">
              sanitized driver detail
            </span>
            <p className="mt-1.5 overflow-x-auto rounded-xl border border-white/8 bg-black/40 px-4 py-3 font-mono text-[11px] leading-5 break-all text-white/45">
              {d.detail}
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">
            how to fix
          </span>
          <span dir="rtl" className="font-mono text-[10px] tracking-wider text-white/35">
            طريقة الحل
          </span>
        </div>

        <ol className="mt-3 space-y-3">
          {d.fixes.map((s, i) => (
            <li
              key={s.en}
              className="flex gap-4 rounded-2xl border border-white/8 bg-white/[0.025] p-4"
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${accent.number} text-xs font-black text-ink`}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm leading-6 font-bold text-white">
                  {s.en}
                </span>
                <span
                  dir="rtl"
                  className="mt-1 block text-sm leading-6 text-white/50"
                >
                  {s.ar}
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
      </div>
    </main>
  );
}
