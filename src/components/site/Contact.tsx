"use client";

import { useActionState } from "react";
import { motion } from "motion/react";
import { sendMessage, type ContactState } from "@/app/actions";
import { Reveal, SectionHeading } from "./Reveal";
import type { Dict } from "@/lib/i18n";
import type { Settings } from "@/lib/types";

const initial: ContactState = { status: "idle" };

function Field({
  label,
  name,
  type = "text",
  required = false,
  area = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  area?: boolean;
}) {
  const cls =
    "peer w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 pt-6 pb-2 text-sm text-white outline-none transition focus:border-[var(--accent)] focus:bg-white/[0.06]";
  return (
    <div className="relative">
      {area ? (
        <textarea name={name} rows={5} required={required} placeholder=" " className={cls} />
      ) : (
        <input name={name} type={type} required={required} placeholder=" " className={cls} />
      )}
      <label className="pointer-events-none absolute start-4 top-2 text-[11px] uppercase tracking-wider text-white/40 transition peer-placeholder-shown:top-4 peer-placeholder-shown:text-sm peer-placeholder-shown:normal-case peer-focus:top-2 peer-focus:text-[11px] peer-focus:tracking-wider peer-focus:text-[var(--accent)]">
        {label}
        {required && <span className="text-[var(--accent)]"> *</span>}
      </label>
    </div>
  );
}

export default function Contact({
  dict,
  settings,
}: {
  dict: Dict;
  settings: Settings;
}) {
  const [state, formAction, pending] = useActionState(sendMessage, initial);

  const channels = [
    settings.email && { label: settings.email, href: `mailto:${settings.email}` },
    settings.phone && { label: settings.phone, href: `tel:${settings.phone}` },
    settings.whatsapp && {
      label: "WhatsApp",
      href: `https://wa.me/${settings.whatsapp}`,
    },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <section id="contact" className="relative py-24 sm:py-32">
      <div className="absolute inset-0 -z-10">
        <div className="aurora opacity-60" />
      </div>
      <div className="container-x grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <div>
          <SectionHeading
            label={dict.contact.label}
            title={dict.contact.title}
            subtitle={dict.contact.subtitle}
          />
          <Reveal delay={0.1}>
            <div className="mt-8 space-y-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/35">
                {dict.contact.or}
              </p>
              {channels.map((c) => (
                <a
                  key={c.href}
                  href={c.href}
                  className="group flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3.5 text-sm text-white/75 transition hover:border-[var(--accent)]/40 hover:bg-white/[0.05]"
                >
                  {c.label}
                  <span className="text-[var(--accent)] transition group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
                    →
                  </span>
                </a>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <form
            action={formAction}
            className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur sm:p-8"
          >
            <div className="pointer-events-none absolute -top-24 -end-24 h-56 w-56 rounded-full bg-[var(--accent)]/15 blur-3xl" />
            <div className="relative grid gap-4 sm:grid-cols-2">
              <Field label={dict.contact.name} name="name" required />
              <Field label={dict.contact.email} name="email" type="email" required />
              <Field label={dict.contact.subject} name="subject" />
              <Field label={dict.contact.budget} name="budget" />
              <div className="sm:col-span-2">
                <Field label={dict.contact.message} name="body" area required />
              </div>
              <input
                type="text"
                name="company"
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                aria-hidden
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="group relative mt-6 w-full overflow-hidden rounded-xl bg-white px-6 py-4 text-sm font-black text-ink transition disabled:opacity-60"
            >
              <span className="relative z-10">
                {pending ? dict.contact.sending : dict.contact.send}
              </span>
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-transform duration-500 group-hover:translate-x-0" />
            </button>

            {state.status !== "idle" && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                  state.status === "ok"
                    ? "bg-emerald-400/10 text-emerald-300"
                    : "bg-rose-500/10 text-rose-300"
                }`}
              >
                {state.status === "ok" ? dict.contact.success : dict.contact.error}
              </motion.p>
            )}
          </form>
        </Reveal>
      </div>
    </section>
  );
}
