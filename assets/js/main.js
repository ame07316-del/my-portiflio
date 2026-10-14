/* ═══════════════════════════════════════════════════════════
   PORTFOLIO — interactions
   Pure vanilla JS, no dependencies.
   ═══════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get: (k, f) => { try { return localStorage.getItem(k) ?? f; } catch { return f; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
  };

  /* ════════ 1. LANGUAGE (EN ⇄ AR) ════════ */
  const i18nNodes = $$('[data-en][data-ar]');
  const i18nAria  = $$('[data-en-aria], [data-ar-aria]');

  function applyLang(lang) {
    root.lang = lang;
    root.dir  = lang === 'ar' ? 'rtl' : 'ltr';
    i18nNodes.forEach(el => { el.textContent = el.dataset[lang === 'ar' ? 'ar' : 'en']; });
    i18nAria.forEach(el => {
      const v = el.dataset[lang === 'ar' ? 'arAria' : 'enAria'];
      if (v) el.setAttribute('aria-label', v);
    });
    document.title = lang === 'ar'
      ? 'اسمك الكامل — مطوّر ويب متكامل'
      : 'Your Name — Full-Stack Developer';
    store.set('lang', lang);
    restartTyping();
  }

  const langBtn = $('#langToggle');
  langBtn?.addEventListener('click', () => {
    applyLang(root.lang === 'ar' ? 'en' : 'ar');
  });

  /* ════════ 2. THEME ════════ */
  const themeBtn = $('#themeToggle');
  function applyTheme(t) { root.dataset.theme = t; store.set('theme', t); }
  themeBtn?.addEventListener('click', () => {
    applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  /* ════════ 3. TYPING EFFECT ════════ */
  // ✏️ EDIT ME: the rotating phrases
  const PHRASES = {
    en: ['web apps that feel instant.', 'design systems people reuse.', 'APIs that don’t fall over.', 'interfaces in Arabic & English.'],
    ar: ['تطبيقات ويب سريعة كالبرق.', 'أنظمة تصميم يُعاد استخدامها.', 'واجهات برمجية لا تنهار.', 'واجهات بالعربية والإنجليزية.']
  };
  const typedEl = $('#typed');
  let typeTimer = null;

  function restartTyping() {
    clearTimeout(typeTimer);
    if (!typedEl) return;
    const words = PHRASES[root.lang] || PHRASES.en;
    if (reduceMotion) { typedEl.textContent = words[0]; return; }

    let wi = 0, ci = 0, deleting = false;
    const tick = () => {
      const word = words[wi];
      ci += deleting ? -1 : 1;
      typedEl.textContent = word.slice(0, ci);

      let delay = deleting ? 34 : 62;
      if (!deleting && ci === word.length) { delay = 1700; deleting = true; }
      else if (deleting && ci === 0) { deleting = false; wi = (wi + 1) % words.length; delay = 320; }
      typeTimer = setTimeout(tick, delay);
    };
    typedEl.textContent = '';
    typeTimer = setTimeout(tick, 500);
  }

  /* ════════ 4. NAV ════════ */
  const nav = $('#nav');
  const burger = $('#burger');
  const navLinks = $('#navLinks');

  burger?.addEventListener('click', () => {
    const open = navLinks.classList.toggle('is-open');
    burger.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  $$('.nav__link').forEach(a => a.addEventListener('click', () => {
    navLinks.classList.remove('is-open');
    burger.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
  }));

  /* ════════ 5. SCROLL: progress, nav state, active link, to-top ════════ */
  const progress = $('#scrollProgress');
  const toTop = $('#toTop');
  const sections = $$('main section[id]');
  const linkFor = id => $(`.nav__link[href="#${id}"]`);

  let ticking = false;
  function onScroll() {
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    nav.classList.toggle('is-scrolled', y > 12);
    toTop.classList.toggle('is-on', y > 600);

    // active section
    let current = sections[0]?.id;
    for (const s of sections) {
      if (s.getBoundingClientRect().top <= innerHeight * 0.35) current = s.id;
    }
    $$('.nav__link').forEach(l => l.classList.toggle('is-active', l.getAttribute('href') === `#${current}`));
    ticking = false;
  }
  addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });

  toTop?.addEventListener('click', () => scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));

  /* ════════ 6. REVEAL ON SCROLL ════════ */
  const revealIO = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      obs.unobserve(e.target);
      if (e.target.matches('.skill-card, .bars, .bar')) fillBars(e.target);
    });
  }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach(el => revealIO.observe(el));

  /* ════════ 7. SKILL BARS ════════ */
  function fillBars(scope) {
    $$('.bar', scope.matches('.bar') ? scope.parentElement : scope).forEach((bar, i) => {
      const lvl = bar.dataset.level || 70;
      bar.style.setProperty('--level', lvl + '%');
      const label = bar.querySelector('span');
      if (label) label.dataset.pct = lvl + '%';
      setTimeout(() => bar.classList.add('is-in'), reduceMotion ? 0 : i * 90);
    });
  }
  // bars that are already on screen at load
  $$('.skill-card').forEach(card => { if (card.getBoundingClientRect().top < innerHeight) fillBars(card); });

  /* ════════ 8. COUNTERS ════════ */
  const countIO = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = +el.dataset.target || 0;
      obs.unobserve(el);
      if (reduceMotion) { el.textContent = target; return; }
      const dur = 1500, t0 = performance.now();
      const step = now => {
        const p = Math.min((now - t0) / dur, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, { threshold: 0.6 });
  $$('.counter').forEach(el => countIO.observe(el));

  /* ════════ 9. PROJECT FILTER ════════ */
  const filters = $$('#filters .filter');
  const projects = $$('#projectsGrid .project');
  const emptyState = $('#emptyState');

  filters.forEach(btn => btn.addEventListener('click', () => {
    filters.forEach(b => { b.classList.remove('is-active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('is-active');
    btn.setAttribute('aria-selected', 'true');
    const f = btn.dataset.filter;
    let shown = 0;
    projects.forEach(p => {
      const match = f === 'all' || p.dataset.cat === f;
      p.classList.toggle('is-hidden', !match);
      if (match) { shown++; p.classList.add('is-in'); }
    });
    if (emptyState) emptyState.hidden = shown !== 0;
  }));

  /* ════════ 10. TILT + SPOTLIGHT ════════ */
  if (!reduceMotion && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const spotlight = $('#spotlight');
    addEventListener('pointermove', e => {
      spotlight.classList.add('is-on');
      spotlight.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    }, { passive: true });
    addEventListener('pointerleave', () => spotlight.classList.remove('is-on'));

    $$('.tilt').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5;
        const py = (e.clientY - r.top) / r.height - .5;
        card.style.transform = `perspective(900px) rotateY(${px * 7}deg) rotateX(${-py * 7}deg) translateY(-6px)`;
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });
  }

  /* ════════ 11. CONTACT FORM ════════
     No backend: it opens the visitor's mail client pre-filled.
     Swap in Formspree/EmailJS/a server endpoint if you prefer. */
  const form = $('#contactForm');
  const note = $('#formNote');
  // ✏️ EDIT ME: your email address
  const MAIL_TO = 'hello@yourdomain.com';

  form?.addEventListener('submit', e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const L = root.lang;

    if (!data.name?.trim() || !data.email?.trim() || !data.message?.trim()) {
      note.className = 'form-note err';
      note.textContent = L === 'ar' ? 'من فضلك املأ الاسم والبريد والرسالة.' : 'Please fill in your name, email and message.';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) {
      note.className = 'form-note err';
      note.textContent = L === 'ar' ? 'صيغة البريد الإلكتروني غير صحيحة.' : 'That email address doesn’t look right.';
      return;
    }

    const subject = encodeURIComponent(data.subject?.trim() || (L === 'ar' ? 'رسالة من موقعك' : 'Message from your portfolio'));
    const body = encodeURIComponent(`${data.message}\n\n— ${data.name}\n${data.email}`);
    location.href = `mailto:${MAIL_TO}?subject=${subject}&body=${body}`;

    note.className = 'form-note ok';
    note.textContent = L === 'ar' ? 'تم فتح بريدك لإرسال الرسالة — شكرًا!' : 'Opening your mail app to send it — thanks!';
    form.reset();
    setTimeout(() => { note.textContent = ''; note.className = 'form-note'; }, 6000);
  });

  /* ════════ 12. BOOT ════════ */
  $('#year').textContent = new Date().getFullYear();
  applyTheme(store.get('theme', 'dark'));
  applyLang(store.get('lang', root.lang === 'ar' ? 'ar' : (navigator.language || 'en').startsWith('ar') ? 'ar' : 'en'));
  onScroll();
})();
