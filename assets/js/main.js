/* ══════════════════════════════════════════════════════════════
   برومبت 4 — الحركة والتفاعلات
   Lenis (سكرول ناعم) + GSAP ScrollTrigger (تثبيت/سكراب/سناب)
   العجلة: CSS 3D بلا WebGL · منطق N-adaptive · تحرير الأطراف من حواف الـ pin
   ══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const root = document.documentElement;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => innerWidth < 640;

  /* ════════ 1 · اللغة (AR افتراضي ⇄ EN) ════════ */
  const i18n = $$('[data-ar][data-en]');
  let lang = 'ar';

  function applyLang(next) {
    lang = next;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.cookie = `lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;  // عشان الـ SSR يجيب meta بنفس اللغة
    i18n.forEach(el => { el.textContent = el.dataset[lang === 'ar' ? 'ar' : 'en']; });
    document.title = lang === 'ar' ? 'عمرو — Web Developer' : 'AMR — Web Developer';
    splitAll();
    buildIndex();
    refreshWheelText();
  }
  $('#langBtn').addEventListener('click', () => {
    applyLang(lang === 'ar' ? 'en' : 'ar');
    document.dispatchEvent(new CustomEvent('amr:lang', { detail: { lang } }));
    syncContent();   // إعادة بناء نصوص الكروت من البيانات باللغة الجديدة
  });

  /* ════════ 2 · كشف على مستوى الكلمة (آمن للعربي — ميتكسرش اتصال الحروف) ════════
     بيشتغل بعد تطبيق اللغة، وبيعيد التقسيم لو اللغة اتغيرت. */
  const WORD_SPLIT = ['.hero__word-in', '.works__title', '.contact__title', '.about__line', '.hero__manifesto'];
  function splitWords(el) {
    if (el.dataset.splitLang === lang) return;
    el.dataset.splitLang = lang;
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((w, i) => {
      const rv = document.createElement('span'); rv.className = 'rv';
      const inr = document.createElement('span'); inr.textContent = w;
      inr.style.transitionDelay = (i * 45) + 'ms';
      rv.appendChild(inr); el.appendChild(rv);
      el.appendChild(document.createTextNode(' '));
    });
  }
  const splitAll = () => WORD_SPLIT.forEach(s => { const el = $(s); if (el) splitWords(el); });

  const rvIO = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); rvIO.unobserve(e.target); }
  }), { threshold: .25 });
  ['.hero', '.works__head', '.about', '.contact'].forEach(s => { const el = $(s); if (el) rvIO.observe(el); });

  /* ════════ 3 · Lenis + شريط التقدم ════════ */
  let lenis = null;
  function initLenis() {
    if (REDUCED || !window.Lenis) return;
    lenis = new Lenis({ duration: 1.05, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  function killLenis() { if (lenis) { lenis.destroy(); lenis = null; } }

  const bar = $('#scrollProgress');
  const strip = $('.strip');
  let lastY = scrollY, skew = 0, skewRaf = 0;
  addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    /* السرعة تحرف شريط المهارات — حركة ترد على فعل الزائر */
    skew = clamp((scrollY - lastY) * .12, -7, 7); lastY = scrollY;
    if (strip) strip.style.transform = `skewY(${skew.toFixed(2)}deg)`;
    cancelAnimationFrame(skewRaf);
    const relax = () => { skew *= .86; if (strip) strip.style.transform = `skewY(${skew.toFixed(2)}deg)`;
      if (Math.abs(skew) > .05) skewRaf = requestAnimationFrame(relax); };
    skewRaf = requestAnimationFrame(relax);
  }, { passive: true });

  /* ════════ 4 · WORKS WHEEL ════════ */
  const works  = $('#works');
  const stage  = $('#wheelStage');
  const cyl    = $('#wheelCyl');
  const CARD_H = 380, GAP = 48;
  let cards = [], N = 0, STEP = 0, R = 0;
  function recompute() {
    cards = $$('.card', cyl);
    N = cards.length;
    STEP = N ? 360 / N : 0;
    R = N ? Math.round(N * (CARD_H + GAP) / (2 * Math.PI)) : 0;   // نصف قطر حقيقي من المحيط
  }
  recompute();
  const idxEl  = $('#wheelIndex');
  const titleEl= $('#wheelTitle');
  const countEl= $('#wheelCount');
  const prevB  = $('#prevBtn'), nextB = $('#nextBtn');

  let f = 0;                 // الفهرس الكسري النشط
  let st = null;             // ScrollTrigger instance
  let animMode = !REDUCED && !isMobile();

  const pad = n => String(n + 1).padStart(2, '0');
  const cardTitle = (c) => c.dataset[lang === 'ar' ? 'titleAr' : 'titleEn'];

  function buildIndex() {
    idxEl.innerHTML = '';
    cards.forEach((c, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const n = document.createElement('span'); n.textContent = pad(i); n.style.opacity = .55;
      b.appendChild(n);
      b.appendChild(document.createTextNode(' ' + cardTitle(c)));
      b.setAttribute('aria-label', (lang === 'ar' ? 'انتقل إلى ' : 'Go to ') + cardTitle(c));
      b.addEventListener('click', () => goTo(i));
      li.appendChild(b); idxEl.appendChild(li);
    });
    buildLabIndex();
  }

  /* فهرس المختبر: تسلسل حقيقي 01–05 (التجارب المعملية فقط) يقفز للعجلة */
  function buildLabIndex() {
    const list = $('#labList');
    if (!list) return;
    list.innerHTML = '';
    cards.forEach((c, i) => {
      if (c.dataset.kind !== 'lab') return;
      const li = document.createElement('li');
      const b = document.createElement('button'); b.type = 'button';
      const num = c.querySelector('.card__idx')?.textContent || '';
      const desc = c.querySelector('.card__desc');
      b.innerHTML = `<span class="li-n">${num}</span><span class="li-t"></span><span class="li-d"></span>`;
      b.querySelector('.li-t').textContent = cardTitle(c);
      b.querySelector('.li-d').textContent = (desc?.textContent || '').slice(0, 90) + '…';
      b.addEventListener('click', () => {
        $('#works').scrollIntoView({ behavior: motionOn ? 'smooth' : 'auto' });
        goTo(i);
      });
      li.appendChild(b); list.appendChild(li);
    });
  }

  /* نسخ حقيقي بقيمة واضحة بعد الفعل */
  $$('.copy').forEach(btn => btn.addEventListener('click', async () => {
    const v = btn.dataset.copy || '';
    try { await navigator.clipboard.writeText(v); }
    catch { const t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    const old = btn.textContent;
    btn.textContent = lang === 'ar' ? 'اتنسخ ✔' : 'COPIED ✔';
    btn.classList.add('is-done');
    setTimeout(() => { btn.textContent = old; btn.classList.remove('is-done'); }, 1400);
  }));

  function refreshWheelText() {
    const a = clamp(Math.round(f), 0, N - 1);
    titleEl.textContent = cardTitle(cards[a]);
    countEl.textContent = `${pad(a)} / ${pad(N - 1)}`;
    $$('button', idxEl).forEach((b, i) => b.setAttribute('aria-current', i === a ? 'true' : 'false'));
    cards.forEach((c, i) => c.classList.toggle('is-active', i === a));
    prevB.disabled = a === 0;
    nextB.disabled = a === N - 1;
  }

  /* التحويل: ميل الحاوية 78°→0 = الحلقة تتحول لأسطوانة · k = مقدار مواجهة البطاقة */
  function apply(p) {
    const morph = clamp(p / .18, 0, 1);
    const tilt  = 78 * (1 - morph);
    const k     = 1 - morph;
    f = p * (N - 1);
    cyl.style.transform = `rotateX(${tilt.toFixed(2)}deg)`;
    cards.forEach((c, i) => {
      const a = (i - f) * STEP;
      c.style.transform =
        `translate(-50%,-50%) rotateX(${a.toFixed(2)}deg) translateZ(${R}px) rotateX(${(-a * k).toFixed(2)}deg)`;
    });
    refreshWheelText();
  }

  function scrollYFor(p) {
    if (!st) return scrollY;
    return st.start + p * (st.end - st.start);
  }
  function goTo(i) {
    const p = clamp(i, 0, N - 1) / (N - 1);
    if (lenis) lenis.scrollTo(scrollYFor(p), { duration: .8 });
    else scrollTo({ top: scrollYFor(p), behavior: 'smooth' });
  }

  function buildWheel() {
    if (!animMode || !window.gsap || !window.ScrollTrigger) { staticMode(); return; }
    gsap.registerPlugin(ScrollTrigger);
    works.classList.remove('no-anim');
    if (st) { st.kill(); st = null; }
    st = ScrollTrigger.create({
      trigger: stage,
      start: 'top top',
      end: () => '+=' + innerHeight * 3,          // مسافة التمرير المثبّتة
      pin: true,
      scrub: .55,
      snap: { snapTo: v => Math.round(v * (N - 1)) / (N - 1), duration: .38, ease: 'power2.out' },
      onUpdate: self => apply(self.progress),
      onRefresh: self => apply(self.progress)
    });
    apply(st.progress);
  }

  function staticMode() {
    if (st) { st.kill(); st = null; }
    works.classList.add('no-anim');
    cards.forEach(c => { c.style.transform = ''; });
    cyl.style.transform = '';
    f = 0; refreshWheelText();
  }

  /* حالة فارغة حقيقية: لو مفيش أعمال، الرسالة تظهر بدل أسطوانة فاضية */
  function emptyCheck() {
    if (N > 0) return;
    const d = document.createElement('div');
    d.className = 'empty-state mono';
    d.setAttribute('data-ar', 'مفيش أعمال منشورة لسه — أول ما يتنشروا هيظهروا هنا.');
    d.setAttribute('data-en', 'No published works yet — they’ll appear here once published.');
    d.textContent = lang === 'ar' ? d.dataset.ar : d.dataset.en;
    stage.appendChild(d);
  }

  prevB.addEventListener('click', () => goTo(Math.round(f) - 1));
  nextB.addEventListener('click', () => goTo(Math.round(f) + 1));

  /* لوحة المفاتيح — بس لما العجلة مركّزة، عشان ميكسرش سكروول الصفحة */
  stage.addEventListener('keydown', e => {
    if (!animMode) return;
    const map = { ArrowUp: -1, ArrowDown: 1 };
    if (e.key in map) { e.preventDefault(); goTo(Math.round(f) + map[e.key]); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
    else if (e.key === 'End')  { e.preventDefault(); goTo(N - 1); }
  });

  /* ════════ 5 · مفتاح الحركة (زي toggle المرجع) ════════ */
  const motionBtn = $('#motionBtn'), motionLabel = $('#motionLabel');
  let motionOn = !REDUCED;

  function setMotion(on) {
    motionOn = on;
    document.body.classList.toggle('no-motion', !on);
    motionBtn.setAttribute('aria-pressed', String(on));
    motionLabel.textContent = on
      ? (lang === 'ar' ? 'الحركة: شغالة' : 'MOTION: ON')
      : (lang === 'ar' ? 'الحركة: متوقفة' : 'MOTION: OFF');
    document.dispatchEvent(new CustomEvent('amr:motion', { detail: { on } }));

    if (on) { killLenis(); initLenis(); animMode = !isMobile(); buildWheel(); ScrollTrigger.refresh(); }
    else    { killLenis(); animMode = false; staticMode(); }
  }
  motionBtn.addEventListener('click', () => setMotion(!motionOn));
  $('#motionDemo')?.addEventListener('click', () => { setMotion(!motionOn); scrollTo({ top: 0, behavior: 'smooth' }); });
  $('#mirrorDemo')?.addEventListener('click', () => $('#langBtn').click());

  addEventListener('resize', () => {
    const want = motionOn && !isMobile();
    if (want !== animMode) { animMode = want; want ? buildWheel() : staticMode(); }
    ScrollTrigger.refresh();
  });

  /* ════════ 7 · مزامنة المحتوى المنشور من الخادم (برومبت 6/7) ════════
     الـ HTML المكتوب بيفضل بديلًا كاملًا لو الـ API فشل — المحتوى مقروء دايمًا. */
  const DRAFTS = new URLSearchParams(location.search).get('drafts') === '1';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const cardHTML = (p, i) => {
    const L = (ar, en) => (lang === 'ar' ? ar : en);
    const kindLabel = p.kind === 'lab' ? L('تجربة معملية', 'LAB') : L('مشروع عميل', 'CLIENT PROJECT');
    return `
    <article class="card" data-id="${esc(p.id)}" data-title-ar="${esc(p.title.ar)}" data-title-en="${esc(p.title.en)}" data-kind="${esc(p.kind)}">
      <div class="card__top mono"><span class="card__idx">${String(i + 1).padStart(2, '0')}</span><span class="card__kind">${kindLabel}</span></div>
      <h3 class="card__title">${esc(L(p.title.ar, p.title.en))}</h3>
      ${(p.images || []).length ? `<img class="card__img" src="/${esc(p.images[0].path)}" alt="${esc(L(p.images[0].alt?.ar, p.images[0].alt?.en))}" loading="lazy" onerror="this.remove()">` : ''}
      <p class="card__desc">${esc(L(p.desc.ar, p.desc.en))}</p>
      <ul class="card__tech mono">${(p.tech || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      ${(p.note && (p.note.ar || p.note.en)) ? `<p class="card__note mono">${esc(L(p.note.ar, p.note.en))}</p>` : ''}
      <div class="card__links">
        ${p.links?.live ? `<a class="btn mono" href="${esc(p.links.live)}" target="_blank" rel="noopener">${L('معاينة', 'LIVE')}</a>` : ''}
        ${p.links?.repo ? `<a class="btn btn--ghost mono" href="${esc(p.links.repo)}" target="_blank" rel="noopener">${L('الكود', 'CODE')}</a>` : ''}
        ${p.kind === 'client' ? `<button class="btn btn--ghost mono" type="button" data-detail="${esc(p.id)}">${L('التفاصيل', 'DETAILS')}</button>` : ''}
      </div>
    </article>`;
  };

  async function syncContent() {
    try {
      const r = await fetch('/api/public/content' + (DRAFTS ? '?drafts=1' : ''));
      if (!r.ok) return;
      const data = await r.json();
      if (data.settings?.theme) root.dataset.theme = data.settings.theme;
      const c = data.settings?.contact;
      if (c) $$('.cline a').forEach(a => {
        const h = a.getAttribute('href') || '';
        if (h.startsWith('mailto:')) a.href = 'mailto:' + c.email;
        else if (h.includes('wa.me')) a.href = 'https://wa.me/' + (c.whatsapp || '').replace(/[^\d]/g, '');
        else if (h.includes('github.com')) a.href = c.github;
      });
      const vis = new Set((data.sections || []).map(s => s.id));
      ['home', 'specialty', 'works', 'about', 'contact'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = vis.has(id) ? '' : 'none';
      });
      cyl.innerHTML = data.projects.map(cardHTML).join('') ||
        `<div class="empty-state mono">${lang === 'ar' ? 'مفيش أعمال منشورة لسه.' : 'No published works yet.'}</div>`;
      recompute(); buildIndex();
      if (motionOn && N) buildWheel(); else staticMode();
      refreshWheelText();
    } catch (e) { /* فشل الأصل الخارجي → الكروت المكتوبة في HTML تفضل شغالة */ }
  }

  /* ════════ 6 · إقلاع ════════ */
  $('#year').textContent = new Date().getFullYear();
  applyLang('ar');
  buildIndex();
  emptyCheck();
  if (motionOn) { initLenis(); buildWheel(); } else { setMotion(false); }
  refreshWheelText();
  syncContent();
})();
