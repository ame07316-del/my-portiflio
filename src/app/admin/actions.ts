"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import {
  changePassword,
  createSession,
  destroySession,
  requireSession,
  updateAccount,
  verifyCredentials,
} from "@/lib/auth";

export type FormState = { ok?: boolean; error?: string; message?: string };

function refresh() {
  revalidatePath("/", "layout");
}

/* --------------------------------- auth ---------------------------------- */

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!email || !password) return { error: "EMPTY" };
  const user = await verifyCredentials(email, password);
  if (!user) return { error: "INVALID" };

  await createSession(user);
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logoutAction() {
  await destroySession();
  redirect("/admin/login");
}

/* -------------------------------- projects -------------------------------- */

function projectPayload(f: FormData) {
  const tags = String(f.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    slug:
      String(f.get("slug") ?? "").trim() ||
      String(f.get("title_en") ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") ||
      `project-${Date.now()}`,
    title_en: String(f.get("title_en") ?? "").trim(),
    title_ar: String(f.get("title_ar") ?? "").trim(),
    summary_en: String(f.get("summary_en") ?? ""),
    summary_ar: String(f.get("summary_ar") ?? ""),
    description_en: String(f.get("description_en") ?? ""),
    description_ar: String(f.get("description_ar") ?? ""),
    tags: JSON.stringify(tags),
    image: String(f.get("image") ?? ""),
    live_url: String(f.get("live_url") ?? ""),
    admin_url: String(f.get("admin_url") ?? ""),
    repo_url: String(f.get("repo_url") ?? ""),
    category: String(f.get("category") ?? "web"),
    year: Number(f.get("year") ?? new Date().getFullYear()) || 2025,
    featured: f.get("featured") === "on",
    published: f.get("published") === "on",
    sort: Number(f.get("sort") ?? 0) || 0,
  };
}

export async function saveProject(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSession();
  const id = Number(formData.get("id") ?? 0);
  const p = projectPayload(formData);
  if (!p.title_en && !p.title_ar) return { error: "TITLE_REQUIRED" };

  try {
    if (id) {
      await query(
        `UPDATE projects SET slug=$1,title_en=$2,title_ar=$3,summary_en=$4,summary_ar=$5,
           description_en=$6,description_ar=$7,tags=$8::jsonb,image=$9,live_url=$10,admin_url=$11,
           repo_url=$12,category=$13,year=$14,featured=$15,published=$16,sort=$17
         WHERE id=$18`,
        [p.slug, p.title_en, p.title_ar, p.summary_en, p.summary_ar, p.description_en,
         p.description_ar, p.tags, p.image, p.live_url, p.admin_url, p.repo_url,
         p.category, p.year, p.featured, p.published, p.sort, id],
      );
    } else {
      await query(
        `INSERT INTO projects (slug,title_en,title_ar,summary_en,summary_ar,description_en,description_ar,
           tags,image,live_url,admin_url,repo_url,category,year,featured,published,sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [p.slug, p.title_en, p.title_ar, p.summary_en, p.summary_ar, p.description_en,
         p.description_ar, p.tags, p.image, p.live_url, p.admin_url, p.repo_url,
         p.category, p.year, p.featured, p.published, p.sort],
      );
    }
  } catch {
    return { error: "SLUG_TAKEN" };
  }
  refresh();
  redirect("/admin/projects");
}

export async function deleteProject(formData: FormData) {
  await requireSession();
  await query("DELETE FROM projects WHERE id=$1", [Number(formData.get("id"))]);
  refresh();
}

export async function toggleProjectFlag(formData: FormData) {
  await requireSession();
  const field = String(formData.get("field"));
  if (!["featured", "published"].includes(field)) return;
  await query(`UPDATE projects SET ${field} = NOT ${field} WHERE id=$1`, [
    Number(formData.get("id")),
  ]);
  refresh();
}

export async function moveProject(formData: FormData) {
  await requireSession();
  const dir = String(formData.get("dir")) === "up" ? -1 : 1;
  await query("UPDATE projects SET sort = sort + $1 WHERE id=$2", [
    dir * 15,
    Number(formData.get("id")),
  ]);
  // renumber to keep values tidy
  const rows = await query<{ id: number }>(
    "SELECT id FROM projects ORDER BY sort ASC, id ASC",
  );
  for (let i = 0; i < rows.length; i++) {
    await query("UPDATE projects SET sort=$1 WHERE id=$2", [(i + 1) * 10, rows[i].id]);
  }
  refresh();
}

/* --------------------------------- skills --------------------------------- */

export async function saveSkill(_prev: FormState, f: FormData): Promise<FormState> {
  await requireSession();
  const id = Number(f.get("id") ?? 0);
  const name = String(f.get("name") ?? "").trim();
  if (!name) return { error: "NAME_REQUIRED" };
  const level = Math.max(0, Math.min(100, Number(f.get("level") ?? 80)));
  const category = String(f.get("category") ?? "frontend");
  const sort = Number(f.get("sort") ?? 0);
  if (id) {
    await query(
      "UPDATE skills SET name=$1, level=$2, category=$3, sort=$4 WHERE id=$5",
      [name, level, category, sort, id],
    );
  } else {
    await query(
      "INSERT INTO skills (name, level, category, sort) VALUES ($1,$2,$3,$4)",
      [name, level, category, sort],
    );
  }
  refresh();
  return { ok: true };
}

export async function deleteSkill(f: FormData) {
  await requireSession();
  await query("DELETE FROM skills WHERE id=$1", [Number(f.get("id"))]);
  refresh();
}

/* -------------------------------- services -------------------------------- */

export async function saveService(_prev: FormState, f: FormData): Promise<FormState> {
  await requireSession();
  const id = Number(f.get("id") ?? 0);
  const data = [
    String(f.get("icon") ?? "code"),
    String(f.get("title_en") ?? ""),
    String(f.get("title_ar") ?? ""),
    String(f.get("desc_en") ?? ""),
    String(f.get("desc_ar") ?? ""),
    Number(f.get("sort") ?? 0),
  ];
  if (!data[1] && !data[2]) return { error: "TITLE_REQUIRED" };
  if (id) {
    await query(
      "UPDATE services SET icon=$1,title_en=$2,title_ar=$3,desc_en=$4,desc_ar=$5,sort=$6 WHERE id=$7",
      [...data, id],
    );
  } else {
    await query(
      "INSERT INTO services (icon,title_en,title_ar,desc_en,desc_ar,sort) VALUES ($1,$2,$3,$4,$5,$6)",
      data,
    );
  }
  refresh();
  return { ok: true };
}

export async function deleteService(f: FormData) {
  await requireSession();
  await query("DELETE FROM services WHERE id=$1", [Number(f.get("id"))]);
  refresh();
}

/* ------------------------------- experiences ------------------------------ */

export async function saveExperience(
  _prev: FormState,
  f: FormData,
): Promise<FormState> {
  await requireSession();
  const id = Number(f.get("id") ?? 0);
  const data = [
    String(f.get("role_en") ?? ""),
    String(f.get("role_ar") ?? ""),
    String(f.get("org_en") ?? ""),
    String(f.get("org_ar") ?? ""),
    String(f.get("period") ?? ""),
    String(f.get("desc_en") ?? ""),
    String(f.get("desc_ar") ?? ""),
    Number(f.get("sort") ?? 0),
  ];
  if (!data[0] && !data[1]) return { error: "ROLE_REQUIRED" };
  if (id) {
    await query(
      `UPDATE experiences SET role_en=$1,role_ar=$2,org_en=$3,org_ar=$4,period=$5,
        desc_en=$6,desc_ar=$7,sort=$8 WHERE id=$9`,
      [...data, id],
    );
  } else {
    await query(
      `INSERT INTO experiences (role_en,role_ar,org_en,org_ar,period,desc_en,desc_ar,sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      data,
    );
  }
  refresh();
  return { ok: true };
}

export async function deleteExperience(f: FormData) {
  await requireSession();
  await query("DELETE FROM experiences WHERE id=$1", [Number(f.get("id"))]);
  refresh();
}

/* -------------------------------- messages -------------------------------- */

export async function toggleMessageRead(f: FormData) {
  await requireSession();
  await query("UPDATE messages SET is_read = NOT is_read WHERE id=$1", [
    Number(f.get("id")),
  ]);
  revalidatePath("/admin", "layout");
}

export async function deleteMessage(f: FormData) {
  await requireSession();
  await query("DELETE FROM messages WHERE id=$1", [Number(f.get("id"))]);
  revalidatePath("/admin", "layout");
}

export async function markAllRead() {
  await requireSession();
  await query("UPDATE messages SET is_read = true WHERE is_read = false");
  revalidatePath("/admin", "layout");
}

/* -------------------------------- settings -------------------------------- */

export async function saveSettings(
  _prev: FormState,
  f: FormData,
): Promise<FormState> {
  await requireSession();
  const s = (k: string) => String(f.get(k) ?? "");
  await query(
    `UPDATE settings SET
      name_en=$1,name_ar=$2,role_en=$3,role_ar=$4,tagline_en=$5,tagline_ar=$6,
      about_en=$7,about_ar=$8,email=$9,phone=$10,location_en=$11,location_ar=$12,
      github=$13,linkedin=$14,twitter=$15,whatsapp=$16,resume_url=$17,
      accent=$18,accent2=$19,available=$20,years=$21,clients=$22,projects_done=$23,
      updated_at=now()
     WHERE id=1`,
    [
      s("name_en"), s("name_ar"), s("role_en"), s("role_ar"), s("tagline_en"),
      s("tagline_ar"), s("about_en"), s("about_ar"), s("email"), s("phone"),
      s("location_en"), s("location_ar"), s("github"), s("linkedin"), s("twitter"),
      s("whatsapp"), s("resume_url"), s("accent") || "#22d3ee",
      s("accent2") || "#a855f7", f.get("available") === "on",
      Number(f.get("years") ?? 0), Number(f.get("clients") ?? 0),
      Number(f.get("projects_done") ?? 0),
    ],
  );
  refresh();
  return { ok: true, message: "SAVED" };
}

/* --------------------------------- account -------------------------------- */

export async function saveAccount(
  _prev: FormState,
  f: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const name = String(f.get("name") ?? "").trim();
  const email = String(f.get("email") ?? "").trim();
  if (!name || !email) return { error: "EMPTY" };
  await updateAccount(session.uid, name, email);
  await createSession({ ...session, name, email });
  refresh();
  return { ok: true, message: "SAVED" };
}

export async function savePassword(
  _prev: FormState,
  f: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const current = String(f.get("current") ?? "");
  const next = String(f.get("next") ?? "");
  const confirm = String(f.get("confirm") ?? "");
  if (next.length < 8) return { error: "TOO_SHORT" };
  if (next !== confirm) return { error: "MISMATCH" };
  const res = await changePassword(session.uid, current, next);
  if (res !== "OK") return { error: res };
  return { ok: true, message: "PASSWORD_CHANGED" };
}
