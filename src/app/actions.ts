"use server";

import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { checkRateLimitShared, clientIp } from "@/lib/ratelimit";
import { LANG_COOKIE } from "@/lib/i18n";

export async function setLang(lang: "en" | "ar") {
  const store = await cookies();
  store.set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

export type ContactState = { status: "idle" | "ok" | "error"; message?: string };

export async function sendMessage(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const budget = String(formData.get("budget") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const honey = String(formData.get("company") ?? "");

  // Spam throttle: 5 messages / 10 min / IP, shared across instances.
  const gate = await checkRateLimitShared(
    `contact:${clientIp(await headers())}`,
    5,
    10 * 60 * 1000,
  );
  if (!gate.ok) return { status: "error", message: "RATE_LIMITED" };

  if (honey) return { status: "ok" }; // bot trap
  if (!name || !email || !body || !/^\S+@\S+\.\S+$/.test(email)) {
    return { status: "error", message: "INVALID" };
  }

  // Second budget per sender, so one mailbox can't be used to spam from
  // many IPs: 3 messages / hour.
  const perSender = await checkRateLimitShared(
    `contact-email:${email.toLowerCase()}`,
    3,
    60 * 60 * 1000,
  );
  if (!perSender.ok) return { status: "error", message: "RATE_LIMITED" };

  try {
    const row = (
      await query<{ id: number }>(
        `INSERT INTO messages (name, email, subject, body, budget)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id`,
        [name.slice(0, 120), email.slice(0, 160), subject.slice(0, 200), body.slice(0, 4000), budget.slice(0, 80)],
      )
    )[0];
    // Best-effort "you have a new message" ping, run AFTER the visitor gets
    // their success response (and never allowed to fail the submission).
    after(() => notifyNewMessage({ id: row?.id, name, email, subject, body }));
    revalidatePath("/admin");
    revalidatePath("/admin/messages");
    return { status: "ok" };
  } catch {
    return { status: "error", message: "DB" };
  }
}

/* ------------------------------------------------------------------ */
/*  Optional "new message" notification                                */
/*                                                                     */
/*  Nothing is sent unless you configure one of these, and a failure   */
/*  here never touches the visitor — the message is already in the DB. */
/*                                                                     */
/*   RESEND_API_KEY + RESEND_FROM + NOTIFY_EMAIL  -> real e-mail       */
/*   NOTIFY_WEBHOOK_URL                           -> any HTTP receiver */
/* ------------------------------------------------------------------ */

async function notifyNewMessage(m: {
  id?: number;
  name: string;
  email: string;
  subject: string;
  body: string;
}) {
  const title = m.subject || "New message on your portfolio";
  const text = `${m.name} <${m.email}>\n\n${m.body}`;

  const hook = process.env.NOTIFY_WEBHOOK_URL?.trim();
  if (hook) {
    await fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: m.id ?? null,
        name: m.name,
        email: m.email,
        subject: title,
        text,
        at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  }

  const key = process.env.RESEND_API_KEY?.trim();
  const to = process.env.NOTIFY_EMAIL?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!key || !to || !from) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to, subject: `💬 ${title}`, text }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => undefined);
}
