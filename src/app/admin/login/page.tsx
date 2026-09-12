import { Suspense } from "react";
import Link from "next/link";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-ink px-5 py-12">
      <div className="aurora" />
      <div className="grid-bg absolute inset-0 opacity-40 [mask-image:radial-gradient(60%_60%_at_50%_50%,#000,transparent)]" />
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <Link
        href="/"
        className="relative mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-white/35 transition hover:text-white"
      >
        ← back to site
      </Link>
    </main>
  );
}
