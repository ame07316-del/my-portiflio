-- Portfolio schema. Compatible with PostgreSQL 14+ (Supabase / Neon / Vercel Postgres)
-- and with PGlite (embedded Postgres) used for local development.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT 'Admin',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id           INT PRIMARY KEY DEFAULT 1,
  name_en      TEXT NOT NULL DEFAULT 'Your Name',
  name_ar      TEXT NOT NULL DEFAULT 'اسمك هنا',
  role_en      TEXT NOT NULL DEFAULT 'Full-Stack Web Developer',
  role_ar      TEXT NOT NULL DEFAULT 'مطور مواقع ويب متكامل',
  tagline_en   TEXT NOT NULL DEFAULT '',
  tagline_ar   TEXT NOT NULL DEFAULT '',
  about_en     TEXT NOT NULL DEFAULT '',
  about_ar     TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  location_en  TEXT NOT NULL DEFAULT 'Cairo, Egypt',
  location_ar  TEXT NOT NULL DEFAULT 'القاهرة، مصر',
  github       TEXT NOT NULL DEFAULT '',
  linkedin     TEXT NOT NULL DEFAULT '',
  twitter      TEXT NOT NULL DEFAULT '',
  whatsapp     TEXT NOT NULL DEFAULT '',
  resume_url   TEXT NOT NULL DEFAULT '',
  accent       TEXT NOT NULL DEFAULT '#22d3ee',
  accent2      TEXT NOT NULL DEFAULT '#a855f7',
  available    BOOLEAN NOT NULL DEFAULT true,
  years        INT NOT NULL DEFAULT 3,
  clients      INT NOT NULL DEFAULT 15,
  projects_done INT NOT NULL DEFAULT 24,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id             SERIAL PRIMARY KEY,
  slug           TEXT UNIQUE NOT NULL,
  title_en       TEXT NOT NULL,
  title_ar       TEXT NOT NULL,
  summary_en     TEXT NOT NULL DEFAULT '',
  summary_ar     TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '',
  tags           JSONB NOT NULL DEFAULT '[]'::jsonb,
  image          TEXT NOT NULL DEFAULT '',
  live_url       TEXT NOT NULL DEFAULT '',
  admin_url      TEXT NOT NULL DEFAULT '',
  repo_url       TEXT NOT NULL DEFAULT '',
  category       TEXT NOT NULL DEFAULT 'web',
  year           INT NOT NULL DEFAULT 2025,
  featured       BOOLEAN NOT NULL DEFAULT false,
  published      BOOLEAN NOT NULL DEFAULT true,
  sort           INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skills (
  id       SERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  level    INT NOT NULL DEFAULT 80,
  category TEXT NOT NULL DEFAULT 'frontend',
  sort     INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS services (
  id       SERIAL PRIMARY KEY,
  icon     TEXT NOT NULL DEFAULT 'code',
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  desc_en  TEXT NOT NULL DEFAULT '',
  desc_ar  TEXT NOT NULL DEFAULT '',
  sort     INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS experiences (
  id      SERIAL PRIMARY KEY,
  role_en TEXT NOT NULL,
  role_ar TEXT NOT NULL,
  org_en  TEXT NOT NULL DEFAULT '',
  org_ar  TEXT NOT NULL DEFAULT '',
  period  TEXT NOT NULL DEFAULT '',
  desc_en TEXT NOT NULL DEFAULT '',
  desc_ar TEXT NOT NULL DEFAULT '',
  sort    INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL,
  budget     TEXT NOT NULL DEFAULT '',
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
