"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { loginAction, type FormState } from "../actions";
import { Alert, SubmitButton } from "@/components/admin/ui";

const initial: FormState = {};

export default function LoginForm({ brandMark = "</>" }: { brandMark?: string }) {
  const params = useSearchParams();
  const next = params.get("next") || "/admin";
  const linkFailed = params.get("e") === "1";
  const [state, action] = useActionState(loginAction, initial);
  const [show, setShow] = useState(false);

  return (
    <motion.form
      action={action}
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-2xl sm:p-9"
    >
      <div className="pointer-events-none absolute -top-28 -right-24 h-56 w-56 rounded-full bg-[var(--accent)]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-24 h-56 w-56 rounded-full bg-[var(--accent-2)]/25 blur-3xl" />

      <div className="relative">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] font-mono text-sm font-black text-ink">
          {brandMark}
        </span>
        <h1 className="mt-5 text-2xl font-black tracking-tight text-white">
          Control Center
        </h1>
        <p className="mt-1.5 text-sm text-white/45">
          Enter your access token to manage the site.
        </p>

        <input type="hidden" name="next" value={next} />

        <label className="mt-7 block">
          <span className="mb-1.5 block text-[11px] font-semibold tracking-wider text-white/45 uppercase">
            Access token
          </span>
          <div className="relative">
            <input
              name="token"
              type={show ? "text" : "password"}
              required
              autoFocus
              autoComplete="one-time-code"
              spellCheck={false}
              placeholder="••••-••••-••••"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 pe-16 font-mono text-sm tracking-[0.2em] text-white outline-none transition placeholder:tracking-normal placeholder:text-white/25 focus:border-[var(--accent)]/60 focus:bg-white/[0.06]"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white/45 transition hover:text-white"
            >
              {show ? "hide" : "show"}
            </button>
          </div>
        </label>

        {(state.error || linkFailed) && (
          <div className="mt-4">
            <Alert tone="error">
              {state.error === "EMPTY"
                ? "Enter your token first."
                : state.error === "RATE_LIMITED"
                  ? "Too many attempts — wait a few minutes and try again."
                  : "That token is not valid."}
            </Alert>
          </div>
        )}

        <div className="mt-6">
          <SubmitButton pendingLabel="Unlocking…" className="w-full py-3">
            Unlock dashboard
          </SubmitButton>
        </div>

        {/* This page is public — never print the real access token here. */}
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-6 rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-3 font-mono text-[11px] leading-5 text-white/35">
            Local dev: your token is in the README / .env (ADMIN_TOKEN).
            <br />
            Rotate it from “Access token” after signing in.
          </p>
        )}
      </div>
    </motion.form>
  );
}
