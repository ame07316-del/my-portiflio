export type Lang = "en" | "ar";

export type User = {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  created_at: string;
};

export type Settings = {
  id: number;
  name_en: string;
  name_ar: string;
  role_en: string;
  role_ar: string;
  tagline_en: string;
  tagline_ar: string;
  about_en: string;
  about_ar: string;
  email: string;
  phone: string;
  location_en: string;
  location_ar: string;
  github: string;
  linkedin: string;
  twitter: string;
  whatsapp: string;
  resume_url: string;
  accent: string;
  accent2: string;
  available: boolean;
  years: number;
  clients: number;
  projects_done: number;
  /* --- brand identity --- */
  brand_mark: string;
  logo_url: string;
  avatar_url: string;
  hero_label_en: string;
  hero_label_ar: string;
  meta_title_en: string;
  meta_title_ar: string;
  meta_desc_en: string;
  meta_desc_ar: string;
  font_pair: string;
  /* --- globe --- */
  show_globe: boolean;
  globe_title_en: string;
  globe_title_ar: string;
  globe_desc_en: string;
  globe_desc_ar: string;
  globe_color: string;
};

export type GlobeLocation = {
  id: number;
  label_en: string;
  label_ar: string;
  caption: string;
  lat: number;
  lng: number;
  avatar: string;
  is_home: boolean;
  sort: number;
};

export type Project = {
  id: number;
  slug: string;
  title_en: string;
  title_ar: string;
  summary_en: string;
  summary_ar: string;
  description_en: string;
  description_ar: string;
  tags: string[];
  image: string;
  live_url: string;
  admin_url: string;
  repo_url: string;
  category: string;
  year: number;
  featured: boolean;
  published: boolean;
  sort: number;
};

export type Skill = {
  id: number;
  name: string;
  level: number;
  category: string;
  sort: number;
};

export type Service = {
  id: number;
  icon: string;
  title_en: string;
  title_ar: string;
  desc_en: string;
  desc_ar: string;
  sort: number;
};

export type Experience = {
  id: number;
  role_en: string;
  role_ar: string;
  org_en: string;
  org_ar: string;
  period: string;
  desc_en: string;
  desc_ar: string;
  sort: number;
};

export type Message = {
  id: number;
  name: string;
  email: string;
  subject: string;
  body: string;
  budget: string;
  is_read: boolean;
  created_at: string;
};

/** Picks the right localized field, e.g. pick(project, "title", lang) */
export function pick<T extends Record<string, unknown>>(
  row: T,
  field: string,
  lang: Lang,
): string {
  const value = row[`${field}_${lang}`] ?? row[`${field}_en`] ?? "";
  return String(value ?? "");
}
