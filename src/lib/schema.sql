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
  year           INT NOT NULL DEFAULT EXTRACT(year FROM now())::int,
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

CREATE TABLE IF NOT EXISTS locations (
  id       SERIAL PRIMARY KEY,
  label_en TEXT NOT NULL,
  label_ar TEXT NOT NULL DEFAULT '',
  caption  TEXT NOT NULL DEFAULT '',
  lat      DOUBLE PRECISION NOT NULL DEFAULT 0,
  lng      DOUBLE PRECISION NOT NULL DEFAULT 0,
  avatar   TEXT NOT NULL DEFAULT '',
  is_home  BOOLEAN NOT NULL DEFAULT false,
  sort     INT NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Incremental migrations (safe to re-run)
-- ---------------------------------------------------------------------------
ALTER TABLE settings ADD COLUMN IF NOT EXISTS brand_mark     TEXT NOT NULL DEFAULT '</>';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_url       TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS avatar_url     TEXT NOT NULL DEFAULT '/avatar.png';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS hero_label_en  TEXT NOT NULL DEFAULT ('Portfolio ' || EXTRACT(year FROM now())::int::text);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS hero_label_ar  TEXT NOT NULL DEFAULT ('أعمالي ' || EXTRACT(year FROM now())::int::text);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS meta_title_en  TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS meta_title_ar  TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS meta_desc_en   TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS meta_desc_ar   TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS font_pair      TEXT NOT NULL DEFAULT 'grotesk';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_globe     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS globe_title_en TEXT NOT NULL DEFAULT 'Working with clients worldwide';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS globe_title_ar TEXT NOT NULL DEFAULT 'بشتغل مع عملاء حول العالم';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS globe_desc_en  TEXT NOT NULL DEFAULT 'Remote-first, timezone friendly. Based in Cairo, shipping products for teams across the globe.';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS globe_desc_ar  TEXT NOT NULL DEFAULT 'بشتغل أونلاين مع أي توقيت. مقري القاهرة، وبسلّم مشاريع لعملاء في كل مكان.';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS globe_color    TEXT NOT NULL DEFAULT '#e9c98b';

-- Token based admin access (replaces email + password)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_token TEXT NOT NULL DEFAULT 'amr-portfolio-2025';

-- ---------------------------------------------------------------------------
-- Content migrations — repoint the AI placeholder art that shipped in early
-- commits at the real project screenshots, and backfill links the first seed
-- didn't carry. Every statement is guarded so anything edited from the admin
-- dashboard (custom image, custom avatar) is left exactly as it is.
-- ---------------------------------------------------------------------------
UPDATE settings SET avatar_url = '/avatar.webp' WHERE avatar_url = '/avatar.png';

UPDATE projects SET image = '/projects/restaurant.webp'
 WHERE slug = 'interactive-restaurant-menu' AND image IN ('', '/projects/restaurant.png');
UPDATE projects SET image = '/projects/gym.webp'
 WHERE slug = 'gym-fitness-platform' AND image IN ('', '/projects/gym.png');
UPDATE projects SET image = '/projects/estate.webp'
 WHERE slug = 'estate-hub-pro' AND image IN ('', '/projects/estate.png');

UPDATE projects SET repo_url = 'https://github.com/ame07316-del/Interactive-Restaurant-Menu'
 WHERE slug = 'interactive-restaurant-menu' AND repo_url = '';
UPDATE projects SET repo_url = 'https://github.com/ame07316-del/gym-fitness'
 WHERE slug = 'gym-fitness-platform' AND repo_url = '';
UPDATE projects SET repo_url = 'https://github.com/ame07316-del/EstateHub-Pro'
 WHERE slug = 'estate-hub-pro' AND repo_url = '';
UPDATE projects SET admin_url = 'https://gym-fitness-liard.vercel.app/admin/login'
 WHERE slug = 'gym-fitness-platform'
   AND admin_url = 'https://gym-fitness-liard.vercel.app/admin/login?next=%2Fadmin';
UPDATE settings SET linkedin = '' WHERE linkedin = 'https://linkedin.com/';

-- ---------------------------------------------------------------------------
-- Shared throttle (serverless-safe)
-- In-memory buckets only protect one function instance; this table makes the
-- login / magic-link / contact budgets global. Rows self-expire on use, and a
-- janitor statement cleans the leftovers.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS throttle (
  key          TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits         INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS throttle_window_start_idx ON throttle (window_start);
