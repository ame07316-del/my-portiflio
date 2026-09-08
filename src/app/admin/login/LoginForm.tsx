"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { loginAction, type FormState } from "../actions";
import { Alert, Input, SubmitButton } from "@/components/admin/ui";

const initial: FormState = {};

export default function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/admin";
  const [state, action] = useActionState(loginAction, initial);

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
          {"</>"}
        </span>
        <h1 className="mt-5 text-2xl font-black tracking-tight text-white">
          Control Center
        </h1>
        <p className="mt-1.5 text-sm text-white/45">
          Sign in to manage your portfolio content.
        </p>

        <input type="hidden" name="next" value={next} />

        <div className="mt-7 space-y-3.5">
          <Input
            label="Email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="admin@portfolio.dev"
          />
          <Input
            label="Password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>

        {state.error && (
          <div className="mt-4">
            <Alert tone="error">
              {state.error === "INVALID"
                ? "Wrong email or password."
                : "Please fill in both fields."}
            </Alert>
          </div>
        )}

        <div className="mt-6">
          <SubmitButton pendingLabel="Signing in…" className="w-full py-3">
            Sign in
          </SubmitButton>
        </div>

        <p className="mt-6 rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-3 font-mono text-[11px] leading-5 text-white/35">
          Demo access — email: admin@portfolio.dev · password: admin1234
          <br />
          Change it from Account after your first login.
        </p>
      </div>
    </motion.form>
  );
}
