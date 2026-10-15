/* ══════════════════════════════════════════════════════════════
   برومبت 1 — دراسة الحالة: حقائق موثّقة فقط.
   أي حقل غير مؤكد بيتعرض كـ «بانتظار التأكيد» مش كحقيقة.
   ══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  const dlg = document.getElementById('caseDlg');
  const kind = document.getElementById('caseKind');
  const title = document.getElementById('caseTitle');
  const body = document.getElementById('caseBody');
  let lang = 'ar';
  document.addEventListener('amr:lang', e => { lang = e.detail.lang; });

  const L = (ar, en) => (lang === 'ar' ? ar : en);

  const CASES = {
    fitzone: {
      kindAr: 'مشروع عميل', kindEn: 'CLIENT PROJECT',
      titleAr: 'FitZone Pro', titleEn: 'FitZone Pro',
      blocks: () => [
        ['h', L('التقنيات (من README والمستودع)', 'Stack (from README & repo)')],
        ['ul', ['Next.js 16 · React 19 · TypeScript', 'Tailwind CSS 4 · Framer Motion', 'Drizzle ORM · PostgreSQL (Supabase / Neon) مع مخزن ذاكرة بديل']],
        ['h', L('ميزات موثّقة', 'Documented features')],
        ['ul', [L('باقات واشتراكات وكوبونات', 'Plans, subscriptions & coupons'),
                L('جدول حصص ومدربون', 'Class schedule & trainers'),
                L('حاسبات لياقة ومعرض وأسئلة شائعة', 'Fitness calculators, gallery & FAQ'),
                L('حجز وعضوية رقمية ولوحة إدارة', 'Booking, digital membership & admin panel')]],
        ['h', L('حدود صادقة', 'Honest limits')],
        ['ul', [L('الـ Checkout محاكاة Sandbox: لا مدفوعات حقيقية ولا تخزين أرقام بطاقات — لا يُوصف كبوابة دفع إنتاجية.',
                  'Checkout is a Sandbox simulation: no real payments and no card storage — not an production payment gateway.')]],
        ['h', L('روابط', 'Links')],
        ['ul', ['gym-fitness-liard.vercel.app', 'github.com/ame07316-del/gym-fitness']]
      ]
    },
    menu: {
      kindAr: 'مشروع عميل — مراجعة كود', kindEn: 'CLIENT PROJECT — CODE REVIEW',
      titleAr: 'Interactive Restaurant Menu', titleEn: 'Interactive Restaurant Menu',
      blocks: () => [
        ['h', L('التقنيات (من package.json)', 'Stack (from package.json)')],
        ['ul', ['Next.js 16.3.3 · React 19.2.8 · TypeScript 5', 'Tailwind CSS 4', 'Supabase (Postgres) · supabase-js 2.115']],
        ['h', L('معمارية مدقّقة من الكود', 'Architecture audited from code')],
        ['ul', [L('مصادقة الأدمن حصريًا بتوكن Supabase يُتحقق منه على السيرفر (lib/server-auth.ts) + كاش للتوكن',
                  'Admin auth exclusively via a Supabase token verified server-side (lib/server-auth.ts) + token cache'),
                L('دالة place_order() بـ SECURITY DEFINER وSELECT … FOR UPDATE — خصم المخزون ذرّي بدون race condition',
                  'place_order() as SECURITY DEFINER with SELECT … FOR UPDATE — atomic stock decrement, no race condition'),
                L('Supabase Realtime عبر WebSocket مع فحص دوري احتياطي 30–60 ثانية، وصلاحيات RLS حتى على الاشتراكات',
                  'Supabase Realtime over WebSocket with a 30–60s polling fallback; RLS applies even to subscriptions'),
                L('٦ endpoints بصلاحيات موثّقة: GET/PUT /api/menu · POST /api/orders · GET/PATCH /api/admin/overview · GET /api/admin/session',
                  '6 endpoints with documented permissions: GET/PUT /api/menu · POST /api/orders · GET/PATCH /api/admin/overview · GET /api/admin/session')]],
        ['h', L('ميزات موثّقة', 'Documented features')],
        ['ul', [L('قائمة RTL: بحث وأقسام وسلة', 'RTL menu: search, categories & cart'),
                L('إرسال الطلب على واتساب برقم طلب حقيقي', 'WhatsApp order submission with a real order number'),
                L('مخزون لكل صنف بحد تنبيه (افتراضي 2) + webhook خارجي', 'Per-item stock with alert threshold (default 2) + external webhook'),
                L('مزامنة لحظية لكل الأجهزة بدون ريفريش', 'Realtime sync across devices without refresh')]],
        ['h', L('روابط', 'Links')],
        ['ul', ['interactive-restaurant-menu-one.vercel.app', 'github.com/ame07316-del/Interactive-Restaurant-Menu']]
      ]
    },
    wheel: {
      kindAr: 'تجربة معملية', kindEn: 'LAB',
      titleAr: 'إزاي اتعملت العجلة', titleEn: 'How the wheel works',
      blocks: () => [
        ['h', L('القرار', 'The decision')],
        ['ul', [L('CSS 3D بدل WebGL: البطاقات عناصر DOM حقيقية فيها لينكات، فأخف وأوصل للوصولية.',
                  'CSS 3D instead of WebGL: cards are real DOM nodes with links — lighter and more accessible.')]],
        ['h', L('الهندسة', 'Geometry')],
        ['ul', [L('نصف القطر من المحيط: R = N·(h+gap) / 2π', 'Radius from circumference: R = N·(h+gap) / 2π'),
                L('الحلقة→أسطوانة: ميل الحاوية rotateX من 78° لـ 0 عبر أول 18% من التمرير المثبّت',
                  'Ring→cylinder: container rotateX from 78° to 0 across the first 18% of the pinned scroll'),
                L('الاستقرار: snap لأقرب بطاقة بـ 380ms', 'Settling: snap to nearest card in 380ms'),
                L('تحرير الصفحة: من حواف الـ pin نفسها — أول بطاقة لفوق وآخر بطاقة لتحت',
                  'Page release: from the pin edges themselves — first card upward, last card downward')]],
        ['h', L('الإدخال', 'Input')],
        ['ul', [L('سكرول · سحب لمسي · ↑ ↓ Home End (لما العجلة مركّزة) · فهرس جانبي · أزرار سابق/تالي',
                  'Scroll · touch drag · ↑ ↓ Home End (when the stage is focused) · side index · prev/next')]],
        ['h', L('البديل', 'Fallback')],
        ['ul', [L('تقليل الحركة أو الهاتف <640px أو إيقاف الحركة: قائمة ثابتة بكل البطاقات والروابط',
                  'Reduced motion, phone <640px, or motion off: a static list with all cards and links')]]
      ]
    }
  };

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-detail]');
    if (!btn) return;
    const c = CASES[btn.dataset.detail];
    if (!c) return;
    kind.textContent  = L(c.kindAr, c.kindEn);
    title.textContent = L(c.titleAr, c.titleEn);
    body.innerHTML = '';
    c.blocks().forEach(([type, content]) => {
      if (type === 'h') { const h = document.createElement('h4'); h.textContent = content; body.appendChild(h); }
      else {
        const ul = document.createElement('ul');
        content.forEach(li => { const el = document.createElement('li'); el.textContent = li; ul.appendChild(el); });
        body.appendChild(ul);
      }
    });
    dlg.showModal();
  });

  document.getElementById('caseX').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });   // كليك على الـ backdrop
})();
