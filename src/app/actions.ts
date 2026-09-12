"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";
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

  // Spam throttle: 5 messages / 10 min / IP.
  const gate = checkRateLimit(`contact:${clientIp(await headers())}`, 5, 10 * 60 * 1000);
  if (!gate.ok) return { status: "error", message: "RATE_LIMITED" };

  if (honey) return { status: "ok" }; // bot trap
  if (!name || !email || !body || !/^\S+@\S+\.\S+$/.test(email)) {
    return { status: "error", message: "INVALID" };
  }

  try {
    await query(
      "INSERT INTO messages (name, email, subject, body, budget) VALUES ($1,$2,$3,$4,$5)",
      [name.slice(0, 120), email.slice(0, 160), subject.slice(0, 200), body.slice(0, 4000), budget.slice(0, 80)],
    );
    revalidatePath("/admin");
    revalidatePath("/admin/messages");
    return { status: "ok" };
  } catch {
    return { status: "error", message: "DB" };
  }
}
