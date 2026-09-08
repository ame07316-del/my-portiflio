/**
 * Database access layer.
 *
 * Production: set `DATABASE_URL` (Supabase / Neon / Vercel Postgres / any Postgres)
 *             and queries run through `pg`.
 * Local dev:  no env needed — an embedded Postgres (PGlite, real Postgres compiled
 *             to WASM) is created under `.data/pgdata`, so the exact same SQL runs
 *             in development and in production.
 */
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

type Row = Record<string, unknown>;
type Result<T> = { rows: T[] };

interface Driver {
  query<T = Row>(text: string, params?: unknown[]): Promise<Result<T>>;
  exec(text: string): Promise<void>;
}

const SCHEMA_PATH = path.join(process.cwd(), "src", "lib", "schema.sql");

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
    return {
      async query<T>(text: string, params: unknown[] = []) {
        const res = await pool.query(text, params as never[]);
        return { rows: res.rows as T[] };
      },
      async exec(text: string) {
        await pool.query(text);
      },
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.join(process.cwd(), ".data", "pgdata");
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const lite = await PGlite.create(dir);
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const res = await lite.query(text, params as unknown[]);
      return { rows: (res.rows ?? []) as T[] };
    },
    async exec(text: string) {
      await lite.exec(text);
    },
  };
}

async function bootstrap(): Promise<Driver> {
  const driver = await createDriver();
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  await driver.exec(schema);
  await seed(driver);
  return driver;
}

const globalForDb = globalThis as unknown as { __pf_db?: Promise<Driver> };

function getDriver(): Promise<Driver> {
  if (!globalForDb.__pf_db) globalForDb.__pf_db = bootstrap();
  return globalForDb.__pf_db;
}

export async function query<T = Row>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const driver = await getDriver();
  const res = await driver.query<T>(text, params);
  return res.rows;
}

export async function queryOne<T = Row>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Seed                                                               */
/* ------------------------------------------------------------------ */

async function seed(db: Driver) {
  const { rows } = await db.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM users",
  );
  if (Number(rows[0]?.count ?? 0) > 0) return;

  const email = process.env.ADMIN_EMAIL || "admin@portfolio.dev";
  const password = process.env.ADMIN_PASSWORD || "admin1234";
  const hash = await bcrypt.hash(password, 10);
  await db.query(
    "INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING",
    [email.toLowerCase(), hash, "Admin"],
  );

  await db.query(
    `INSERT INTO settings (id, name_en, name_ar, role_en, role_ar, tagline_en, tagline_ar,
       about_en, about_ar, email, phone, location_en, location_ar, github, linkedin, twitter, whatsapp)
     VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (id) DO NOTHING`,
    [
      "Amr",
      "عمرو",
      "Full-Stack Web Developer",
      "مطوّر ويب متكامل",
      "I build fast, beautiful web products — from pixel-perfect interfaces to the admin dashboards that run them.",
      "بصمم وأبرمج مواقع سريعة وجميلة — من الواجهة المتقنة لحد لوحة التحكم اللي بتدير كل حاجة.",
      "I'm a web developer focused on turning ideas into production-ready products. I work end-to-end: interface design, front-end engineering, APIs, databases and the admin panels clients actually use every day. Recent work includes an interactive restaurant menu with a full management dashboard, a gym & fitness platform with member administration, and a real-estate listing hub.",
      "مطوّر ويب متخصص في تحويل الأفكار لمنتجات جاهزة للإطلاق. بشتغل على المشروع من أوله لآخره: تصميم الواجهة، برمجة الفرونت إند، الـ APIs، قواعد البيانات، ولوحات التحكم اللي العميل بيستخدمها كل يوم. من آخر أعمالي: منيو مطعم تفاعلي بلوحة إدارة كاملة، منصة جيم ولياقة بنظام إدارة أعضاء، ومنصة عقارات.",
      "ame07316@gmail.com",
      "+20 128 837 3753",
      "Cairo, Egypt",
      "القاهرة، مصر",
      "https://github.com/",
      "https://linkedin.com/",
      "",
      "201288373753",
    ],
  );

  const locations: Array<[string, string, string, number, number, boolean, number]> = [
    ["Cairo", "القاهرة", "Home base", 30.0444, 31.2357, true, 1],
    ["Dubai", "دبي", "Client", 25.2048, 55.2708, false, 2],
    ["Riyadh", "الرياض", "Client", 24.7136, 46.6753, false, 3],
    ["London", "لندن", "Client", 51.5074, -0.1278, false, 4],
    ["Berlin", "برلين", "Client", 52.52, 13.405, false, 5],
    ["New York", "نيويورك", "Client", 40.7128, -74.006, false, 6],
    ["Toronto", "تورونتو", "Client", 43.6532, -79.3832, false, 7],
    ["Singapore", "سنغافورة", "Client", 1.3521, 103.8198, false, 8],
  ];
  for (const l of locations) {
    await db.query(
      `INSERT INTO locations (label_en, label_ar, caption, lat, lng, is_home, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      l,
    );
  }

  const projects: Array<[string, string, string, string, string, string, string, string[], string, string, string, string, number, boolean, number]> = [
    [
      "interactive-restaurant-menu",
      "Interactive Restaurant Menu",
      "منيو مطعم تفاعلي",
      "A digital menu customers browse on their phone, plus a full admin dashboard for dishes, categories, prices and availability.",
      "منيو رقمي يتصفحه العميل من موبايله، مع لوحة تحكم كاملة للأصناف والأقسام والأسعار والتوفر.",
      "A QR-first digital menu built for real restaurants. Guests browse rich dish cards with photos, allergens and prices in Arabic or English, while the owner manages everything from a protected dashboard: create categories, upload dishes, toggle availability in one tap, reorder the menu by drag, and track what's trending. Optimised for slow mobile connections and 100% responsive.",
      "منيو رقمي يعمل بالـ QR ومصمم لمطاعم حقيقية. الزبون يتصفح كروت الأصناف بالصور والأسعار بالعربي أو الإنجليزي، وصاحب المطعم يدير كل حاجة من لوحة تحكم محمية: إضافة أقسام، رفع أصناف، إخفاء أو إظهار الصنف بضغطة، إعادة ترتيب المنيو، ومتابعة الأكثر طلبًا. متوافق تمامًا مع الموبايل.",
      ["Next.js", "TypeScript", "Admin Dashboard", "Tailwind", "QR Menu"],
      "/projects/restaurant.png",
      "https://interactive-restaurant-menu-one.vercel.app/",
      "https://interactive-restaurant-menu-one.vercel.app/admin",
      "web-app",
      2025,
      true,
      1,
    ],
    [
      "gym-fitness-platform",
      "Gym & Fitness Platform",
      "منصة جيم ولياقة",
      "A high-energy gym website with class schedules, membership plans and a secure admin area for the staff.",
      "موقع جيم بتصميم قوي فيه جدول الحصص وباقات الاشتراك ولوحة إدارة محمية للفريق.",
      "A conversion-focused website for a fitness brand: bold hero, trainer profiles, class timetable, membership pricing and lead capture. Behind a protected login, staff manage plans, schedules and content without touching code. Built with authentication, protected routes and a redirect-aware login flow.",
      "موقع مصمم لتحويل الزائر لعميل: هيرو قوي، صفحات المدربين، جدول الحصص، باقات الاشتراك، ونموذج تسجيل اهتمام. ووراء تسجيل دخول محمي، الفريق يقدر يدير الباقات والجداول والمحتوى من غير ما يلمس الكود. مبني بنظام صلاحيات ومسارات محمية.",
      ["Next.js", "Auth", "Protected Routes", "Dashboard", "Responsive"],
      "/projects/gym.png",
      "https://gym-fitness-liard.vercel.app/",
      "https://gym-fitness-liard.vercel.app/admin/login?next=%2Fadmin",
      "website",
      2025,
      true,
      2,
    ],
    [
      "estate-hub-pro",
      "EstateHub Pro",
      "منصة العقارات",
      "A property listing hub with rich search, filtering and detailed property pages.",
      "منصة عقارات فيها بحث متقدم وفلاتر وصفحات تفاصيل غنية للوحدات.",
      "A real-estate platform where visitors search properties by location, price and type, compare listings, and open detailed pages with galleries and agent contact. Data-driven listings, fast filtering and a layout that scales from a handful of units to thousands.",
      "منصة عقارية يقدر الزائر يبحث فيها بالموقع والسعر والنوع، يقارن الوحدات، ويفتح صفحة تفاصيل فيها معرض صور وبيانات التواصل. فلترة سريعة وتصميم يستحمل من عشرات لآلاف الوحدات.",
      ["Next.js", "Search & Filters", "UI/UX", "Listings", "SEO"],
      "/projects/estate.png",
      "https://estate-hub-pro.vercel.app/",
      "",
      "web-app",
      2025,
      true,
      3,
    ],
  ];

  for (const p of projects) {
    await db.query(
      `INSERT INTO projects (slug, title_en, title_ar, summary_en, summary_ar, description_en, description_ar,
         tags, image, live_url, admin_url, category, year, featured, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (slug) DO NOTHING`,
      [p[0], p[1], p[2], p[3], p[4], p[5], p[6], JSON.stringify(p[7]), p[8], p[9], p[10], p[11], p[12], p[13], p[14]],
    );
  }

  const skills: Array<[string, number, string, number]> = [
    ["Next.js / React", 92, "frontend", 1],
    ["TypeScript", 88, "frontend", 2],
    ["Tailwind CSS", 94, "frontend", 3],
    ["Three.js / WebGL", 78, "frontend", 4],
    ["Framer Motion", 85, "frontend", 5],
    ["Node.js / APIs", 86, "backend", 6],
    ["PostgreSQL", 82, "backend", 7],
    ["Auth & Security", 80, "backend", 8],
    ["Admin Dashboards", 90, "backend", 9],
    ["UI / UX Design", 84, "design", 10],
    ["Performance & SEO", 83, "design", 11],
    ["Git & Deployment", 88, "tools", 12],
  ];
  for (const s of skills) {
    await db.query(
      "INSERT INTO skills (name, level, category, sort) VALUES ($1,$2,$3,$4)",
      s,
    );
  }

  const services: Array<[string, string, string, string, string, number]> = [
    [
      "layers",
      "Landing Pages & Websites",
      "مواقع وصفحات هبوط",
      "Marketing sites that load fast, look premium and turn visitors into clients.",
      "مواقع سريعة بشكل احترافي بتحوّل الزائر لعميل فعلي.",
      1,
    ],
    [
      "dashboard",
      "Admin Dashboards",
      "لوحات تحكم إدارية",
      "Custom control panels: CRUD, roles, analytics, media uploads — built around how you actually work.",
      "لوحات تحكم مخصصة: إضافة وتعديل وحذف، صلاحيات، إحصائيات، رفع ملفات — مبنية على طريقة شغلك.",
      2,
    ],
    [
      "cube",
      "3D & Motion Experiences",
      "تجارب ثري دي وحركة",
      "WebGL scenes, scroll storytelling and micro-interactions that make a brand unforgettable.",
      "مشاهد WebGL وحركات تفاعلية تخلي البراند محفور في ذهن العميل.",
      3,
    ],
    [
      "bolt",
      "Web Apps & APIs",
      "تطبيقات ويب و APIs",
      "Full products: authentication, databases, payments and clean APIs that scale.",
      "منتجات كاملة: تسجيل دخول، قواعد بيانات، مدفوعات، و APIs نظيفة قابلة للتوسع.",
      4,
    ],
  ];
  for (const s of services) {
    await db.query(
      "INSERT INTO services (icon, title_en, title_ar, desc_en, desc_ar, sort) VALUES ($1,$2,$3,$4,$5,$6)",
      s,
    );
  }

  const experiences: Array<[string, string, string, string, string, string, string, number]> = [
    [
      "Freelance Web Developer",
      "مطوّر ويب مستقل",
      "Self-employed",
      "عمل حر",
      "2024 — Present",
      "Designing and shipping complete web products for restaurants, gyms and real-estate businesses, including their admin dashboards.",
      "تصميم وتنفيذ منتجات ويب كاملة لمطاعم وصالات جيم وشركات عقارات، شاملة لوحات التحكم الخاصة بيها.",
      1,
    ],
    [
      "Front-End Developer",
      "مطوّر واجهات أمامية",
      "Client projects",
      "مشاريع عملاء",
      "2023 — 2024",
      "Built responsive interfaces with Next.js and Tailwind, focusing on performance, accessibility and animation.",
      "بناء واجهات متجاوبة باستخدام Next.js و Tailwind مع تركيز على الأداء وسهولة الوصول والحركة.",
      2,
    ],
    [
      "Learning & Open Source",
      "تعلّم ومساهمات مفتوحة",
      "Community",
      "المجتمع",
      "2022 — 2023",
      "Deep dive into JavaScript, React and databases; shipped practice projects and helped other developers.",
      "تعمّق في جافاسكريبت وريأكت وقواعد البيانات، وتنفيذ مشاريع تدريبية ومساعدة مطورين آخرين.",
      3,
    ],
  ];
  for (const e of experiences) {
    await db.query(
      `INSERT INTO experiences (role_en, role_ar, org_en, org_ar, period, desc_en, desc_ar, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      e,
    );
  }
}
