import { query, queryOne } from "@/lib/db";
import type {
  Experience,
  Message,
  Project,
  Service,
  Settings,
  Skill,
} from "@/lib/types";

export async function getSettings(): Promise<Settings> {
  const row = await queryOne<Settings>("SELECT * FROM settings WHERE id = 1");
  if (row) return row;
  await query("INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING");
  return (await queryOne<Settings>("SELECT * FROM settings WHERE id = 1"))!;
}

export async function getProjects(onlyPublished = true): Promise<Project[]> {
  const rows = await query<Project>(
    `SELECT * FROM projects ${onlyPublished ? "WHERE published = true" : ""}
     ORDER BY sort ASC, id ASC`,
  );
  return rows.map((r) => ({
    ...r,
    tags: normalizeTags(r.tags),
  }));
}

export async function getProject(id: number): Promise<Project | null> {
  const row = await queryOne<Project>("SELECT * FROM projects WHERE id = $1", [id]);
  return row ? { ...row, tags: normalizeTags(row.tags) } : null;
}

function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === "string") {
    try {
      const parsed = JSON.parse(tags);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return tags.split(",").map((t) => t.trim()).filter(Boolean);
    }
  }
  return [];
}

export function getSkills(): Promise<Skill[]> {
  return query<Skill>("SELECT * FROM skills ORDER BY sort ASC, id ASC");
}

export function getServices(): Promise<Service[]> {
  return query<Service>("SELECT * FROM services ORDER BY sort ASC, id ASC");
}

export function getExperiences(): Promise<Experience[]> {
  return query<Experience>("SELECT * FROM experiences ORDER BY sort ASC, id ASC");
}

export function getMessages(): Promise<Message[]> {
  return query<Message>("SELECT * FROM messages ORDER BY created_at DESC, id DESC");
}

export async function getStats() {
  const [projects, messages, unread, skills] = await Promise.all([
    queryOne<{ c: string }>("SELECT count(*)::text AS c FROM projects"),
    queryOne<{ c: string }>("SELECT count(*)::text AS c FROM messages"),
    queryOne<{ c: string }>(
      "SELECT count(*)::text AS c FROM messages WHERE is_read = false",
    ),
    queryOne<{ c: string }>("SELECT count(*)::text AS c FROM skills"),
  ]);
  return {
    projects: Number(projects?.c ?? 0),
    messages: Number(messages?.c ?? 0),
    unread: Number(unread?.c ?? 0),
    skills: Number(skills?.c ?? 0),
  };
}
