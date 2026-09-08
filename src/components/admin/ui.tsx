"use client";

import { useFormStatus } from "react-dom";

export function Card({
  title,
  desc,
  children,
  actions,
  className = "",
}: {
  title?: string;
  desc?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/8 bg-white/[0.025] p-5 sm:p-6 ${className}`}
    >
      {(title || actions) && (
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-bold text-white">{title}</h2>}
            {desc && <p className="mt-1 text-xs text-white/45">{desc}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

const base =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[var(--accent)] focus:bg-white/[0.06]";

export function Input({
  label,
  hint,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
          {label}
        </span>
      )}
      <input {...props} className={base} />
      {hint && <span className="mt-1 block text-[11px] text-white/30">{hint}</span>}
    </label>
  );
}

export function Textarea({
  label,
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
          {label}
        </span>
      )}
      <textarea {...props} className={`${base} min-h-28 leading-6`} />
    </label>
  );
}

export function Select({
  label,
  children,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
          {label}
        </span>
      )}
      <select {...props} className={`${base} [&>option]:bg-[#0b0e18]`}>
        {children}
      </select>
    </label>
  );
}

export function Toggle({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
      <span className="text-sm text-white/70">{label}</span>
      <span className="relative inline-flex">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-white/12 transition peer-checked:bg-[var(--accent)]" />
        <span className="absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
      </span>
    </label>
  );
}

export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "ghost" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary:
      "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-ink font-bold hover:opacity-90",
    ghost: "border border-white/12 text-white/75 hover:border-white/30",
    danger: "border border-rose-500/30 text-rose-300 hover:bg-rose-500/10",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm transition disabled:opacity-50 ${styles} ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function IconButton({
  children,
  title,
  variant = "ghost",
}: {
  children: React.ReactNode;
  title?: string;
  variant?: "ghost" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      title={title}
      disabled={pending}
      className={`grid h-8 w-8 place-items-center rounded-lg border text-xs transition disabled:opacity-40 ${
        variant === "danger"
          ? "border-rose-500/25 text-rose-300 hover:bg-rose-500/10"
          : "border-white/10 text-white/60 hover:border-white/30 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export function Alert({
  tone = "ok",
  children,
}: {
  tone?: "ok" | "error";
  children: React.ReactNode;
}) {
  return (
    <p
      className={`rounded-xl px-4 py-2.5 text-sm ${
        tone === "ok"
          ? "bg-emerald-400/10 text-emerald-300"
          : "bg-rose-500/10 text-rose-300"
      }`}
    >
      {children}
    </p>
  );
}
