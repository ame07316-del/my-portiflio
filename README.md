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
- 🎞️ Scroll reveals, custom cursor, scroll progress, tech marquee, 3D tilt project cards,
  animated skill bars, timeline, process, contact form.
- 📱 Fully responsive and reduced-motion friendly.

**Admin control center** (`/admin`)
- 🔐 JWT session cookie + bcrypt password + `proxy.ts` route protection.
- 📊 Overview with live stats, recent messages and a setup checklist.
- 🗂 Projects CRUD: bilingual content, tags, cover image, live/admin/repo links,
  reorder, feature & publish toggles.
- 🧩 Skills, Services and Experience managers (inline editing).
- 📬 Inbox for contact-form messages: read/unread, reply, delete.
- 🎨 Site settings: every hero/about/contact string in both languages + the two accent
  colours that drive the whole theme and the 3D scenes.
- 👤 Account: change name, email and password.

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
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
AUTH_SECRET="a-long-random-string"
ADMIN_EMAIL="you@example.com"
ADMIN_PASSWORD="something-strong"
```

---

## ☁️ Deploy (Vercel)

1. Push the repo and import it on Vercel.
2. Add a Postgres database (Supabase / Neon / Vercel Postgres) and set `DATABASE_URL`.
3. Set `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
4. Deploy — the schema and seed data are created on the first request.

> On serverless the filesystem is read-only, so `DATABASE_URL` **is required** in production.

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

## 🖼 Replacing the placeholder art

`public/projects/*.png` and `public/avatar.png` are AI-generated placeholders.
Drop your own screenshots into `public/projects/` and point each project's
**Cover image** field (Admin → Projects) at them, e.g. `/projects/my-shot.png`.
