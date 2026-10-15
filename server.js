/* ══════════════════════════════════════════════════════════════
   برومبت 6 — الخلفية: node:http بلا اعتماديات.
   كل صلاحية وتحقق يُفرض هنا على السيرفر. الواجهة مجرد راحة استخدام.
   ══════════════════════════════════════════════════════════════ */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const DB = path.join(DATA, 'db.json');
const PORT = 8080;

fs.mkdirSync(UPLOADS, { recursive: true });

/* ─────────── كلمة السر: من البيئة أو تُولّد وتُكتب خارج git ─────────── */
let PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) {
  const credFile = path.join(DATA, 'credentials.txt');
  if (fs.existsSync(credFile)) PASSWORD = fs.readFileSync(credFile, 'utf8').trim();
  else {
    PASSWORD = crypto.randomBytes(9).toString('base64url');
    fs.writeFileSync(credFile, PASSWORD + '\n', { mode: 0o600 });
    console.log('[boot] ADMIN PASSWORD generated -> data/credentials.txt');
  }
}
const scrypt = p => crypto.scryptSync(p, 'amr-portfolio-salt', 64).toString('hex');
let PASSWORD_HASH = scrypt(PASSWORD);

/* ─────────── المخزن ─────────── */
const now = () => new Date().toISOString();
const SEED = {
  projects: [
    { id: 'fitzone', slug: 'fitzone-pro', order: 1, status: 'published', kind: 'client',
      title: { ar: 'FitZone Pro', en: 'FitZone Pro' },
      desc: { ar: 'منصة جيم: باقات واشتراكات وكوبونات، جدول ومدربون، حاسبات لياقة، حجز وعضوية رقمية، ولوحة إدارة.',
              en: 'Gym platform: plans, subscriptions & coupons, schedule & trainers, fitness calculators, booking, digital membership and an admin panel.' },
      role: { ar: '', en: '' },
      tech: ['Next.js 16', 'React 19', 'TypeScript', 'Tailwind 4', 'Framer Motion', 'Drizzle / PostgreSQL'],
      links: { live: 'https://gym-fitness-liard.vercel.app/', repo: 'https://github.com/ame07316-del/gym-fitness' },
      images: [], note: { ar: 'الدفع محاكاة Sandbox — لا مدفوعات حقيقية ولا تخزين بطاقات.',
                          en: 'Checkout is a Sandbox simulation — no real payments, no card storage.' },
      createdAt: now(), updatedAt: now() },
    { id: 'menu', slug: 'interactive-restaurant-menu', order: 2, status: 'published', kind: 'client',
      title: { ar: 'Interactive Restaurant Menu', en: 'Interactive Restaurant Menu' },
      desc: { ar: 'قائمة مطعم RTL full-stack: بحث وأقسام وسلة، طلب عبر واتساب برقم طلب، مخزون بخصم ذرّي وتنبيهات نقص، ومزامنة لحظية لكل الأجهزة، ولوحة أدمن محمية.',
              en: 'RTL full-stack restaurant menu: search, categories & cart, WhatsApp ordering with a real order number, atomic stock decrement with low-stock alerts, realtime sync across devices, and a protected admin panel.' },
      role: { ar: '', en: '' },
      tech: ['Next.js 16.3.3', 'React 19.2.8', 'TypeScript', 'Tailwind 4', 'Supabase / Postgres', 'Realtime WS'],
      links: { live: 'https://interactive-restaurant-menu-one.vercel.app/', repo: 'https://github.com/ame07316-del/Interactive-Restaurant-Menu' },
      images: [], note: { ar: 'المصادقة بتوكن Supabase يتحقق منه على السيرفر + صلاحيات RLS.',
                          en: 'Auth via a Supabase token verified server-side + RLS permissions.' },
      createdAt: now(), updatedAt: now() },
    ...[ ['wheel', 'Lab 02 — عجلة الأعمال', 'Lab 02 — Works Wheel', 4],
         ['hold',  'Lab 03 — اضغط واستمر',  'Lab 03 — Click & Hold', 5],
         ['rtl',   'Lab 04 — مرآة الحركة للعربية', 'Lab 04 — RTL Motion Mirror', 6],
         ['inertia','Lab 05 — سكرول بالقصور الذاتي', 'Lab 05 — Inertia Scroll', 7],
         ['glass', 'Lab 01 — الكرة الزجاجية المنكسرة', 'Lab 01 — Refractive Glass Sphere', 3] ]
      .map(([id, ar, en, order]) => ({
        id, slug: id, order, status: 'published', kind: 'lab',
        title: { ar, en }, desc: { ar: 'تجربة معملية ضمن هذا الموقع.', en: 'A lab experiment inside this site.' },
        role: { ar: 'تجربة معملية', en: 'Lab experiment' }, tech: ['CSS 3D', 'Three.js', 'GSAP', 'Lenis'],
        links: {}, images: [], note: { ar: '', en: '' }, createdAt: now(), updatedAt: now() }))
  ],
  sections: [ { id: 'home', visible: true, order: 1 }, { id: 'specialty', visible: true, order: 2 },
              { id: 'works', visible: true, order: 3 }, { id: 'about', visible: true, order: 4 },
              { id: 'contact', visible: true, order: 5 } ],
  settings: { contact: { email: 'ame07316@gmail.com', whatsapp: '+20 128 837 3753', github: 'https://github.com/ame07316-del' },
              seo: { title: { ar: 'عمرو — Web Developer', en: 'AMR — Web Developer' },
                     desc: { ar: 'أعمال حقيقية موثّقة وتجارب معملية في الحركة والـ 3D.', en: 'Documented real work and lab experiments in motion and 3D.' } },
              theme: 'dark' },
  versions: [], changelog: []
};

let db = null;
function load() {
  if (fs.existsSync(DB)) db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  else { db = SEED; save(); }
}
function save() {   // كتابة ذرّية: tmp + rename
  const tmp = DB + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB);
}
load();

/* ─────────── جلسات + CSRF ─────────── */
const sessions = new Map();   // token -> {exp, csrf}
const SESSION_MS = 1000 * 60 * 60 * 8;

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(kv => {
    const i = kv.indexOf('='); if (i > 0) out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
  });
  return out;
}
function authed(req) {
  const sid = parseCookies(req).sid;
  const s = sid && sessions.get(sid);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(sid); return null; }
  return { sid, ...s };
}

/* ─────────── أدوات ─────────── */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };

function json(res, code, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function readBody(req, limit = 3 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too_large')); req.destroy(); }
      else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const isUrl = v => !v || /^https:\/\/[^\s]+$/i.test(v);
const STATUSES = ['draft', 'published', 'in_progress', 'archived'];
const KINDS = ['client', 'lab'];

function missingFields(p) {
  const m = [];
  ['ar', 'en'].forEach(l => {
    if (!p.title?.[l]?.trim()) m.push('title.' + l);
    if (!p.desc?.[l]?.trim()) m.push('desc.' + l);
  });
  if (!p.tech?.length) m.push('tech');
  if (!isUrl(p.links?.live) || !isUrl(p.links?.repo)) m.push('links');
  if (!STATUSES.includes(p.status)) m.push('status');
  if (!KINDS.includes(p.kind)) m.push('kind');
  if (typeof p.order !== 'number') m.push('order');
  return m;
}
function validateProject(p) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['body'];
  if (!STATUSES.includes(p.status)) errs.push('status: enum');
  if (!KINDS.includes(p.kind)) errs.push('kind: enum');
  if (!isUrl(p.links?.live) || !isUrl(p.links?.repo)) errs.push('links: https url');
  if (typeof p.order !== 'number' || p.order < 0) errs.push('order: number>=0');
  if (!Array.isArray(p.tech)) errs.push('tech: array');
  if (p.images && !Array.isArray(p.images)) errs.push('images: array');
  return errs;
}
function log(action, entity) {
  db.changelog.unshift({ at: now(), action, entity, by: 'amr' });
  db.changelog = db.changelog.slice(0, 200);
}
function snapshot(projectId) {
  const p = db.projects.find(x => x.id === projectId);
  if (!p) return;
  db.versions.unshift({ projectId, at: now(), snapshot: JSON.parse(JSON.stringify(p)) });
  db.versions = db.versions.filter(v => v.projectId === projectId).slice(0, 12)
    .concat(db.versions.filter(v => v.projectId !== projectId));
}

/* ─────────── الخادم ─────────── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const sess = authed(req);

  try {
    /* ── API عام ── */
    if (p === '/api/public/content' && req.method === 'GET') {
      const wantDrafts = url.searchParams.get('drafts') === '1' && sess;
      const projects = db.projects
        .filter(x => wantDrafts ? x.status !== 'archived' : x.status === 'published')
        .sort((a, b) => a.order - b.order)
        .map(x => ({ ...x, _missing: missingFields(x) }));
      return json(res, 200, { projects, sections: db.sections.filter(s => s.visible).sort((a, b) => a.order - b.order),
        settings: { contact: db.settings.contact, seo: db.settings.seo, theme: db.settings.theme },
        drafts: !!wantDrafts });
    }

    if (p === '/api/login' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      const pw = String(body.password || '').slice(0, 200);
      const ok = pw.length > 0 && crypto.timingSafeEqual(Buffer.from(scrypt(pw)), Buffer.from(PASSWORD_HASH));
      if (!ok) return json(res, 401, { error: 'bad_credentials' });
      const sid = crypto.randomBytes(24).toString('hex');
      const csrf = crypto.randomBytes(16).toString('hex');
      sessions.set(sid, { exp: Date.now() + SESSION_MS, csrf });
      log('login', 'session'); save();
      return json(res, 200, { csrf }, { 'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}` });
    }

    if (p === '/api/session' && req.method === 'GET')
      return json(res, 200, sess ? { ok: true, csrf: sess.csrf } : { ok: false });

    if (p === '/api/logout' && req.method === 'POST') {
      if (sess) sessions.delete(sess.sid);
      return json(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    }

    /* ── API إدارة: كل شيء بعد هنا يتطلب جلسة ── */
    if (p.startsWith('/api/admin/')) {
      if (!sess) return json(res, 401, { error: 'unauthorized' });
      const mutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
      if (mutating && req.headers['x-csrf'] !== sess.csrf) return json(res, 403, { error: 'csrf' });

      if (p === '/api/admin/content' && req.method === 'GET')
        return json(res, 200, { ...db, projects: db.projects.map(x => ({ ...x, _missing: missingFields(x) })) });

      let m;
      if ((m = p.match(/^\/api\/admin\/projects\/([^/]+)$/)) && req.method === 'PUT') {
        const proj = db.projects.find(x => x.id === m[1]);
        if (!proj) return json(res, 404, { error: 'not_found' });
        const next = JSON.parse(await readBody(req) || '{}');
        const errs = validateProject(next);
        if (errs.length) return json(res, 400, { error: 'validation', fields: errs });
        snapshot(proj.id);
        Object.assign(proj, next, { updatedAt: now() });
        log('update', proj.id); save();
        return json(res, 200, { ...proj, _missing: missingFields(proj) });
      }
      if ((m = p.match(/^\/api\/admin\/projects\/([^/]+)\/(publish|unpublish|archive)$/)) && req.method === 'POST') {
        const proj = db.projects.find(x => x.id === m[1]);
        if (!proj) return json(res, 404, { error: 'not_found' });
        const act = m[2];
        if (act === 'publish') {
          if (proj.status === 'in_progress')
            return json(res, 409, { error: 'in_progress_cannot_publish_as_complete' });
          const missing = missingFields(proj);
          const langMissing = missing.filter(f => f.startsWith('title.') || f.startsWith('desc.'));
          if (langMissing.length && req.headers['x-confirm-missing'] !== '1')
            return json(res, 409, { error: 'missing_translation', missing: langMissing });
          if (missing.length && req.headers['x-confirm-missing'] !== '1')
            return json(res, 409, { error: 'missing_fields', missing });
        }
        snapshot(proj.id);
        proj.status = act === 'publish' ? 'published' : act === 'unpublish' ? 'draft' : 'archived';
        proj.updatedAt = now();
        log(act, proj.id); save();
        return json(res, 200, proj);
      }
      if ((m = p.match(/^\/api\/admin\/projects$/)) && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const id = 'p' + crypto.randomBytes(4).toString('hex');
        const proj = { id, slug: id, order: db.projects.length + 1, status: 'draft', kind: 'lab',
          title: { ar: '', en: '' }, desc: { ar: '', en: '' }, role: { ar: '', en: '' }, tech: [],
          links: {}, images: [], note: { ar: '', en: '' }, createdAt: now(), updatedAt: now(), ...body, id };
        const errs = validateProject(proj);
        if (errs.length) return json(res, 400, { error: 'validation', fields: errs });
        db.projects.push(proj); log('create', id); save();
        return json(res, 201, proj);
      }
      if ((m = p.match(/^\/api\/admin\/projects\/([^/]+)\/versions$/)) && req.method === 'GET')
        return json(res, 200, db.versions.filter(v => v.projectId === m[1]).map(v => ({ at: v.at })));
      if ((m = p.match(/^\/api\/admin\/projects\/([^/]+)\/restore$/)) && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const v = db.versions.find(x => x.projectId === m[1] && x.at === body.at);
        if (!v) return json(res, 404, { error: 'version_not_found' });
        const i = db.projects.findIndex(x => x.id === m[1]);
        if (i < 0) return json(res, 404, { error: 'not_found' });
        snapshot(m[1]);                                   // الحالة الحالية تُحفظ أولًا — لا فقدان
        db.projects[i] = JSON.parse(JSON.stringify(v.snapshot));
        log('restore', m[1]); save();
        return json(res, 200, db.projects[i]);
      }
      if ((m = p.match(/^\/api\/admin\/projects\/([^/]+)$/)) && req.method === 'DELETE') {
        const i = db.projects.findIndex(x => x.id === m[1]);
        if (i < 0) return json(res, 404, { error: 'not_found' });
        snapshot(m[1]);
        const [gone] = db.projects.splice(i, 1);
        log('delete', gone.id); save();
        return json(res, 200, { ok: true });
      }
      if (p === '/api/admin/sections' && req.method === 'PUT') {
        const next = JSON.parse(await readBody(req) || '[]');
        if (!Array.isArray(next)) return json(res, 400, { error: 'validation' });
        db.sections = next.map(s => ({ id: String(s.id), visible: !!s.visible, order: Number(s.order) || 0 }));
        log('sections', 'order/visibility'); save();
        return json(res, 200, db.sections);
      }
      if (p === '/api/admin/settings' && req.method === 'PUT') {
        const next = JSON.parse(await readBody(req) || '{}');
        if (next.contact) db.settings.contact = { ...db.settings.contact, ...next.contact };
        if (next.seo) db.settings.seo = { ...db.settings.seo, ...next.seo };
        if (['dark', 'light'].includes(next.theme)) db.settings.theme = next.theme;
        log('settings', 'update'); save();
        return json(res, 200, db.settings);
      }
      if (p === '/api/admin/media' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const buf = Buffer.from(String(body.data || '').split(',')[1] || '', 'base64');
        if (!buf.length || buf.length > 2 * 1024 * 1024) return json(res, 400, { error: 'size' });
        const sig = { png: [0x89, 0x50], jpg: [0xff, 0xd8], webp: [0x52, 0x49] }[body.type];
        if (!sig || buf[0] !== sig[0] || buf[1] !== sig[1]) return json(res, 400, { error: 'bad_type' });
        const name = crypto.randomBytes(6).toString('hex') + '.' + body.type;
        fs.writeFileSync(path.join(UPLOADS, name), buf);
        log('upload', name); save();
        return json(res, 201, { path: 'data/uploads/' + name });
      }
      if ((m = p.match(/^\/api\/admin\/media\/([^/]+)$/)) && req.method === 'DELETE') {
        const rel = 'data/uploads/' + m[1];
        const usedBy = db.projects.filter(pr => (pr.images || []).some(im => im.path === rel)).map(pr => pr.id);
        if (usedBy.length) return json(res, 409, { error: 'media_in_use', usedBy });
        fs.rmSync(path.join(UPLOADS, m[1]), { force: true });
        log('delete_media', m[1]); save();
        return json(res, 200, { ok: true });
      }
      if (p === '/api/admin/changelog' && req.method === 'GET') return json(res, 200, db.changelog);
      if (p === '/api/admin/media' && req.method === 'GET') {
        const names = fs.readdirSync(UPLOADS).filter(n => /\.(png|jpe?g|webp)$/i.test(n));
        return json(res, 200, names.map(name => ({
          name, path: 'data/uploads/' + name,
          usedBy: db.projects.filter(pr => (pr.images || []).some(im => im.path === 'data/uploads/' + name)).map(pr => pr.id)
        })));
      }
      return json(res, 404, { error: 'no_route' });
    }

    /* ── ملفات ثابتة ── */
    let file = p === '/' ? '/index.html' : p;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const abs = path.join(ROOT, file);
    if (!abs.startsWith(ROOT)) return json(res, 403, { error: 'traversal' });
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    // ممنوع تقديم كود الخادم أو المخزن أو الـ git كملفات ثابتة
    if (rel === 'server.js' || rel.startsWith('data/') || rel.startsWith('.git') || rel === '.gitignore')
      { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
    const stat = await fsp.stat(abs).catch(() => null);
    if (!stat || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream',
      'Cache-Control': path.extname(abs) === '.html' ? 'no-store' : 'public, max-age=3600' });
    fs.createReadStream(abs).pipe(res);
  } catch (e) {
    json(res, e.message === 'too_large' ? 413 : 500, { error: e.message === 'too_large' ? 'too_large' : 'server' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log('[boot] server on 0.0.0.0:' + PORT));
