# Portfolio 3D — Next.js + WebGL + Admin Control Center

منصة بورتفوليو ثلاثية الأبعاد لمطوّر ويب: واجهة عامة ثنائية اللغة (EN / AR مع RTL كامل)،
صفحة تحميل WebGL، ولوحة تحكم كاملة يتم منها تعديل كل كلمة ولون ومشروع على الموقع.

A 3D portfolio for a web developer: bilingual public site (EN / AR with full RTL),
a WebGL loading experience, and a complete admin dashboard that controls every word,
colour and project on the site.

---

## ✨ What's inside

**Public site**
- 🌀 **Crazy WebGL preloader** — 16k GPU particles morphing sphere → torus-knot → grid,
  wireframe core, scrambling HUD text, counter, and an exit shock-wave with curtain reveal.
- 🔮 **Hero scene** — custom GLSL noise-displaced orb with fresnel iridescence, particle
  dust and orbit rings, all reacting to the mouse.
- 🌍 **EN / AR switch** — one click, cookie-persisted, `dir="rtl"` applied at the root.
- 🌐 **Luxury 3D globe** — dotted-earth (4,067 pre-computed land dots), fresnel
  atmosphere, gold great-circle arcs from your home base, pulsing interactive pins
  with labels/avatars, drag to spin. Pins are managed from the dashboard.
- 🎞️ Scroll reveals, custom cursor, scroll progress, tech marquee, 3D tilt project cards,
  animated skill bars, timeline, process, contact form.
- 📱 Fully responsive and reduced-motion friendly.

**Admin control center** (`/admin`)
- 🔐 JWT session cookie + bcrypt password + `proxy.ts` route protection.
- 📊 Overview with live stats, recent messages and a setup checklist.
- 🗂 Projects CRUD: bilingual content, tags, cover image, live/admin/repo links,
  reorder, feature & publish toggles.
- 🧩 Skills, Services, Experience and **Globe locations** managers (inline editing).
- 📬 Inbox for contact-form messages: read/unread, reply, delete.
- 🎨 **Full brand identity**: monogram/logo image (also the favicon), portrait, display
  typeface (5 presets), hero eyebrow, SEO title & description, the two accent colours
  and the globe highlight colour — every string in EN **and** AR.
- 👤 Account: change name, email and password.
- 🗄 Database screen: connection status, per-table row counts, JSON backup /
  restore and one-click migrations.

---

## 🚀 Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000> — and <http://localhost:3000/admin> for the dashboard.

**Default admin login** (seeded on first run):

```
email:    admin@portfolio.dev
password: admin1234
```

> Change it right away from **Admin → Account**, or set `ADMIN_EMAIL` / `ADMIN_PASSWORD`
> before the first run.

---

## 🗄 Database

The app talks to **PostgreSQL** through one thin layer (`src/lib/db.ts`):

| Environment | Driver | Setup |
|---|---|---|
| Local dev (default) | **PGlite** — real Postgres compiled to WASM, stored in `.data/pgdata` | nothing to do |
| Production | **`pg`** → Supabase / Neon / Vercel Postgres / any Postgres | set `DATABASE_URL` |

The same SQL (`src/lib/schema.sql`) runs in both, so there are no surprises when you deploy.
Tables are created and seeded automatically on first boot.

```bash
cp .env.example .env.local
```

```env
DATABASE_URL="postgresql://user:pass@host:6543/postgres?sslmode=require"
AUTH_SECRET="a-long-random-string"     # openssl rand -base64 32
ADMIN_EMAIL="you@example.com"
ADMIN_PASSWORD="something-strong"
```

### Database CLI

| Command | What it does |
|---|---|
| `npm run db:check` | test the connection, list tables and row counts |
| `npm run db:push` | create/patch every table (idempotent) |
| `npm run db:export -- backup.json` | dump all content to JSON |
| `npm run db:import -- backup.json` | restore content from JSON |
| `npm run db:copy-local` | copy the local dev database into `DATABASE_URL` |
| `npm run db:serve-local` | expose the local database as a real Postgres server on :5432 |

No terminal? **Admin → Database** shows the live connection, row counts, backup
download, restore-from-file and a "run migrations" button.

📘 **Step-by-step Supabase guide (Arabic): [`docs/DATABASE.ar.md`](docs/DATABASE.ar.md)**

---

## ☁️ Deploy (Vercel)

1. Import the repo on <https://vercel.com/new> (framework auto-detected).
2. Add the environment variables **before** the first deploy:

| Name | Value |
|---|---|
| `DATABASE_URL` | Supabase **Transaction pooler** URI (port 6543) + `?sslmode=require` |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | your first admin login |
| `DATABASE_POOL_MAX` | `1` on serverless |
| `NEXT_PUBLIC_SITE_URL` | your final domain |

3. Deploy — the schema and starter content are created on the first request
   (guarded by a Postgres advisory lock so concurrent cold starts can't double-seed).

> Serverless filesystems are read-only, so `DATABASE_URL` **is required** in
> production. Without it the site shows a friendly "Connect a database" screen
> instead of crashing.

🚀 **Step-by-step deploy guide (Arabic): [`docs/DEPLOY.ar.md`](docs/DEPLOY.ar.md)**

---

## 🧱 Tech

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS v4 ·
Three.js + React Three Fiber + custom GLSL · Motion · PostgreSQL (`pg` / PGlite) ·
jose (JWT) · bcryptjs.

## 📁 Structure

```
src/
├─ app/
│  ├─ page.tsx                 # public site
│  ├─ actions.ts               # language switch + contact form
│  └─ admin/
│     ├─ actions.ts            # all admin server actions
│     ├─ login/                # sign in
│     └─ (dashboard)/          # protected pages
├─ components/
│  ├─ three/                   # Preloader, HeroScene, GLSL shaders
│  ├─ site/                    # public sections
│  └─ admin/                   # dashboard UI + managers
├─ lib/                        # db, auth, queries, i18n, types, schema.sql
└─ proxy.ts                    # /admin route protection
```

## 🌐 The globe

`src/components/ui/3d-globe.tsx` is a standalone component:

```tsx
<Globe3D
  markers={[{ lat: 30.0444, lng: 31.2357, label: "Cairo", home: true }]}
  config={{ atmosphereColor: "#4da6ff", atmosphereIntensity: 20, bumpScale: 5, autoRotateSpeed: 0.3 }}
  onMarkerClick={(m) => console.log(m.label)}
  onMarkerHover={(m) => console.log(m?.label)}
/>
```

The land dot-matrix is generated once from Natural Earth data:

```bash
node scripts/build-globe-dots.mjs   # -> public/globe-dots.json
```

## 🖼 Replacing the placeholder art

`public/projects/*.png` and `public/avatar.png` are AI-generated placeholders.
Drop your own screenshots into `public/projects/` and point each project's
**Cover image** field (Admin → Projects) at them, e.g. `/projects/my-shot.png`.
