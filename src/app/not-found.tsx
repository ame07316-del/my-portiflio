import Link from "next/link";

export default function NotFound() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-ink px-6 text-center">
      <div className="aurora" />
      <div className="grid-bg absolute inset-0 opacity-30 [mask-image:radial-gradient(60%_60%_at_50%_50%,#000,transparent)]" />
      <div className="relative">
        <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-white/40">
          error / 404
        </p>
        <h1
          className="mt-4 text-[22vw] leading-none font-black tracking-tighter text-transparent sm:text-[12rem]"
          style={{ WebkitTextStroke: "1px rgba(255,255,255,.25)" }}
        >
          404
        </h1>
        <p className="mt-4 text-white/55">
          This page drifted off into the void.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-xl bg-white px-6 py-3 text-sm font-bold text-ink transition hover:scale-105"
        >
          Back home
        </Link>
      </div>
    </main>
  );
}
