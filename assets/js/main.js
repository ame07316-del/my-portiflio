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
    i18n.forEach(el => { el.textContent = el.dataset[lang === 'ar' ? 'ar' : 'en']; });
    document.title = lang === 'ar' ? 'عمرو — Web Developer' : 'AMR — Web Developer';
    splitAll();
    buildIndex();
    refreshWheelText();
  }
  $('#langBtn').addEventListener('click', () => {
    applyLang(lang === 'ar' ? 'en' : 'ar');
    document.dispatchEvent(new CustomEvent('amr:lang', { detail: { lang } }));
  });

  /* ════════ 2 · كشف على مستوى الكلمة (آمن للعربي — ميتكسرش اتصال الحروف) ════════
     بيشتغل بعد تطبيق اللغة، وبيعيد التقسيم لو اللغة اتغيرت. */
  const WORD_SPLIT = ['.hero__word-in', '.works__title', '.contact__title', '.about__line', '.hero__q'];
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
  addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  }, { passive: true });

  /* ════════ 4 · WORKS WHEEL ════════ */
  const works  = $('#works');
  const stage  = $('#wheelStage');
  const cyl    = $('#wheelCyl');
  const cards  = $$('.card', cyl);
  const N      = cards.length;
  const STEP   = 360 / N;
  const CARD_H = 380, GAP = 48;
  const R      = Math.round(N * (CARD_H + GAP) / (2 * Math.PI));   // نصف قطر حقيقي من المحيط
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
      b.textContent = cardTitle(c);
      b.setAttribute('aria-label', (lang === 'ar' ? 'انتقل إلى ' : 'Go to ') + cardTitle(c));
      b.addEventListener('click', () => goTo(i));
      li.appendChild(b); idxEl.appendChild(li);
    });
  }

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

  /* ════════ 6 · إقلاع ════════ */
  $('#year').textContent = new Date().getFullYear();
  applyLang('ar');
  buildIndex();
  emptyCheck();
  if (motionOn) { initLenis(); buildWheel(); } else { setMotion(false); }
  refreshWheelText();
})();
