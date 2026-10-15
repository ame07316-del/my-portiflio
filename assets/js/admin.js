/* ══════════════════════════════════════════════════════════════
   برومبت 16 — لوحة الإدارة (واجهة فقط؛ كل صلاحية على السيرفر)
   ══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  let CSRF = '', DB = null, ed = null, edLang = 'ar', setLang = 'ar';

  const status = (m) => { const el = $('#status'); el.textContent = m; if (m) setTimeout(() => { el.textContent = ''; }, 4000); };

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (CSRF && opts.method && opts.method !== 'GET') headers['x-csrf'] = CSRF;
    const r = await fetch(path, { ...opts, headers, credentials: 'same-origin' });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      // جلسة منتهية أو غير مخوّل: رجوع فوري لشاشة الدخول برسالة واضحة — مفيش شاشة مكسورة
      if (r.status === 401 && !path.includes('/login') && !path.includes('/session')) sessionExpired();
      const e = new Error(body.error || r.status); e.body = body; e.code = r.status; throw e;
    }
    return body;
  }
  function sessionExpired() {
    $('#viewApp').hidden = true; $('#viewLogin').hidden = false;
    $('#loginErr').textContent = 'انتهت الجلسة أو مفيش صلاحية — ادخل تاني.';
  }

  /* انقطاع/رجوع الشبكة: مؤشر واضح بدل فقدان تعديلات بصمت */
  addEventListener('offline', () => status('⚠ الشبكة مقطوعة — أي حفظ هيفشل لحد ما ترجع'));
  addEventListener('online',  () => status('الشبكة رجعت ✔'));

  /* ── تأكيد عام ── */
  const dlg = $('#confirmDlg');
  let cfResolve = null;
  function ask(title, lines) {
    $('#cfTitle').textContent = title;
    $('#cfBody').innerHTML = '';
    const ul = document.createElement('ul');
    lines.forEach(l => { const li = document.createElement('li'); li.textContent = l; ul.appendChild(li); });
    $('#cfBody').appendChild(ul);
    dlg.showModal();
    return new Promise(res => { cfResolve = res; });
  }
  $('#cfYes').addEventListener('click', () => { dlg.close(); cfResolve?.(true); });
  $('#cfNo').addEventListener('click', () => { dlg.close(); cfResolve?.(false); });

  /* ── دخول / خروج ── */
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) });
      CSRF = r.csrf;
      $('#viewLogin').hidden = true; $('#viewApp').hidden = false;
      await load();
    } catch (err) { $('#loginErr').textContent = err.code === 401 ? 'كلمة سر غير صحيحة' : 'خطأ: ' + err.message; }
  });
  $('#logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); location.reload(); });

  /* ── تبديل الشاشات ── */
  const show = v => {
    $$('.view').forEach(s => { s.hidden = s.dataset.view !== v; });
    $$('.adm__nav button').forEach(b => b.classList.toggle('is-on', b.dataset.view === v));
  };
  $$('.adm__nav button').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));

  /* ── تحميل ورسم ── */
  async function load() {
    DB = await api('/api/admin/content');
    renderDash(); renderProjects(); renderSections(); renderMedia(); renderSettings(); renderLog();
  }

  const AR_STATUS = { draft: 'مسودة', published: 'منشور', in_progress: 'قيد التنفيذ', archived: 'مؤرشف' };

  function renderDash() {
    const c = { published: 0, draft: 0, in_progress: 0, archived: 0 };
    DB.projects.forEach(p => c[p.status]++);
    $('#tiles').innerHTML = Object.entries(c).map(([k, v]) =>
      `<div class="tile"><b>${v}</b><span>${AR_STATUS[k]}</span></div>`).join('');
    const warns = DB.projects.flatMap(p => (p._missing || []).map(m => `${p.title.ar || p.id}: ناقص ${m}`));
    $('#warns').innerHTML = warns.length ? warns.map(w => `<li>${w}</li>`).join('') : '<li></li>';
    $('#dashLog').innerHTML = DB.changelog.slice(0, 8).map(l =>
      `<li><time>${l.at.slice(0, 16).replace('T', ' ')}</time><span>${l.action} · ${l.entity}</span></li>`).join('');
  }

  function renderProjects() {
    $('#plist').innerHTML = '';
    [...DB.projects].sort((a, b) => a.order - b.order).forEach(p => {
      const li = document.createElement('li'); li.className = 'pitem';
      li.innerHTML = `
        <div class="pitem__top">
          <span class="pitem__name">${p.title.ar || p.title.en || p.id}</span>
          <span>
            <span class="badge badge--${p.status}">${AR_STATUS[p.status]}</span>
            <span class="badge ${p.kind === 'lab' ? 'badge--lab' : ''}">${p.kind === 'lab' ? 'Lab' : 'عميل'}</span>
            ${(p._missing || []).length ? `<span class="badge badge--in_progress">ناقص ${(p._missing || []).length}</span>` : ''}
          </span>
        </div>
        <div class="pitem__acts">
          <button class="btn btn--ghost mono" data-act="edit">تحرير</button>
          ${p.status !== 'published' ? '<button class="btn mono" data-act="publish">نشر</button>' : ''}
          ${p.status === 'published' ? '<button class="btn btn--ghost mono" data-act="unpublish">إلغاء نشر</button>' : ''}
          ${p.status !== 'archived' ? '<button class="btn btn--ghost mono" data-act="archive">أرشفة</button>' : ''}
          <button class="btn btn--ghost mono" data-act="delete">حذف</button>
        </div>`;
      li.querySelector('[data-act="edit"]').addEventListener('click', () => openEditor(p.id));
      li.querySelector('[data-act="publish"]')?.addEventListener('click', () => publish(p.id));
      li.querySelector('[data-act="unpublish"]')?.addEventListener('click', () => act(p.id, 'unpublish'));
      li.querySelector('[data-act="archive"]')?.addEventListener('click', () => act(p.id, 'archive'));
      li.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        const ok = await ask('حذف المشروع', [p.title.ar || p.id, 'هيتم حفظ نسخة قبل الحذف. تأكيد؟']);
        if (!ok) return;
        await api(`/api/admin/projects/${p.id}`, { method: 'DELETE' });
        status('اتحذف ✔'); await load();
      });
      $('#plist').appendChild(li);
    });
  }

  async function act(id, a) {
    try { await api(`/api/admin/projects/${id}/${a}`, { method: 'POST' }); status('تم ✔'); await load(); }
    catch (e) { status('⚠ ' + (e.body?.error || e.message)); }
  }

  async function publish(id) {
    try { await api(`/api/admin/projects/${id}/publish`, { method: 'POST' }); status('اتنشر ✔'); await load(); }
    catch (e) {
      if (e.code === 409 && e.body.error === 'in_progress_cannot_publish_as_complete')
        return status('⚠ مشروع قيد التنفيذ لا يُنشر كمكتمل — غيّر الحالة أولًا');
      if (e.code === 409 && (e.body.error === 'missing_translation' || e.body.error === 'missing_fields')) {
        const ok = await ask('نشر بترجمة/حقول ناقصة', e.body.missing.map(m => 'ناقص: ' + m));
        if (!ok) return;
        await api(`/api/admin/projects/${id}/publish`, { method: 'POST', headers: { 'x-confirm-missing': '1' } });
        status('اتنشر مع التحذير ✔'); await load();
      } else status('⚠ ' + (e.body?.error || e.message));
    }
  }

  /* ── المحرر ── */
  function openEditor(id) {
    ed = JSON.parse(JSON.stringify(DB.projects.find(p => p.id === id)));
    edLang = 'ar';
    $$('#langTabs button').forEach(b => b.classList.toggle('is-on', b.dataset.l === 'ar'));
    fillEditor();
    show('editor');
    $('#edTitle').textContent = 'تحرير: ' + (ed.title.ar || ed.id);
    loadVersions();
  }
  function fillEditor() {
    $('#f_title').value = ed.title[edLang] || '';
    $('#f_desc').value = ed.desc[edLang] || '';
    $('#f_role').value = ed.role?.[edLang] || '';
    $('#f_note').value = ed.note?.[edLang] || '';
    $('#f_status').value = ed.status; $('#f_kind').value = ed.kind;
    $('#f_order').value = ed.order; $('#f_tech').value = (ed.tech || []).join(', ');
    $('#f_live').value = ed.links?.live || ''; $('#f_repo').value = ed.links?.repo || '';
    $('#f_missing').textContent = (ed._missing || []).length ? 'حقول ناقصة: ' + ed._missing.join(', ') : 'كل الحقول المطلوبة مكتملة ✔';
    renderImgs();
  }
  $$('#langTabs button').forEach(b => b.addEventListener('click', () => {
    collectEditor(); edLang = b.dataset.l;
    $$('#langTabs button').forEach(x => x.classList.toggle('is-on', x === b));
    fillEditor();
  }));
  function collectEditor() {
    if (!ed) return;
    ed.title[edLang] = $('#f_title').value; ed.desc[edLang] = $('#f_desc').value;
    ed.role[edLang] = $('#f_role').value; ed.note[edLang] = $('#f_note').value;
  }
  ['f_title', 'f_desc', 'f_role', 'f_note'].forEach(id => $('#' + id).addEventListener('input', collectEditor));
  $('#edForm').addEventListener('change', () => {
    ed.status = $('#f_status').value; ed.kind = $('#f_kind').value;
    ed.order = +$('#f_order').value || 0;
    ed.tech = $('#f_tech').value.split(',').map(s => s.trim()).filter(Boolean);
    ed.links = { live: $('#f_live').value.trim(), repo: $('#f_repo').value.trim() };
  });
  $('#edForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('#edForm').dispatchEvent(new Event('change')); collectEditor();
    try {
      ed = await api(`/api/admin/projects/${ed.id}`, { method: 'PUT', body: JSON.stringify(ed) });
      status('اتحفظ كمسودة ✔'); await load(); fillEditor(); loadVersions();
    } catch (err) { status('⚠ تحقق: ' + (err.body?.fields || []).join(', ')); }
  });
  $('#edPublish').addEventListener('click', () => publish(ed.id));
  $('#edUnpublish').addEventListener('click', () => act(ed.id, 'unpublish'));
  $('#edBack').addEventListener('click', () => { ed = null; show('projects'); });

  function renderImgs() {
    const ul = $('#f_imgs'); ul.innerHTML = '';
    (ed.images || []).forEach((im, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<img src="/${im.path}" alt=""><span class="mono">${im.path}</span>`;
      const b = document.createElement('button'); b.className = 'btn btn--ghost mono'; b.textContent = 'إزالة';
      b.addEventListener('click', () => { ed.images.splice(i, 1); renderImgs(); });
      li.appendChild(b); ul.appendChild(li);
    });
  }
  $('#f_imgfile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const type = f.type.split('/')[1];
    const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    try {
      const res = await api('/api/admin/media', { method: 'POST', body: JSON.stringify({ type, data }) });
      ed.images = ed.images || [];
      ed.images.push({ path: res.path, alt: { ar: $('#f_imgalt').value, en: $('#f_imgalt').value } });
      renderImgs(); status('اترفع ✔');
    } catch (err) { status('⚠ رفع مرفوض: ' + err.body?.error); }
  });

  async function loadVersions() {
    const vs = await api(`/api/admin/projects/${ed.id}/versions`);
    $('#edVersions').innerHTML = vs.length
      ? vs.map(v => `<li><time>${v.at.slice(0, 16).replace('T', ' ')}</time>
          <button class="btn btn--ghost mono" data-at="${v.at}">استعادة</button></li>`).join('')
      : '<li><time>—</time><span>مفيش نسخ لسه</span></li>';
    $$('#edVersions button').forEach(b => b.addEventListener('click', async () => {
      const ok = await ask('استعادة نسخة', ['الحالة الحالية هتتحفظ كنسخة أولًا. تأكيد؟']);
      if (!ok) return;
      ed = await api(`/api/admin/projects/${ed.id}/restore`, { method: 'POST', body: JSON.stringify({ at: b.dataset.at }) });
      status('اتستعاد ✔'); fillEditor(); await load();
    }));
  }

  /* ── جديد ── */
  $('#newProject').addEventListener('click', async () => {
    const p = await api('/api/admin/projects', { method: 'POST', body: JSON.stringify({}) });
    await load(); openEditor(p.id);
  });

  /* ── الأقسام ── */
  function renderSections() {
    $('#sects').innerHTML = '';
    [...DB.sections].sort((a, b) => a.order - b.order).forEach(s => {
      const li = document.createElement('li');
      li.innerHTML = `<input type="checkbox" ${s.visible ? 'checked' : ''} data-id="${s.id}">
        <span class="mono">${s.id}</span>
        <input type="number" min="0" value="${s.order}" data-order="${s.id}">`;
      $('#sects').appendChild(li);
    });
  }
  $('#saveSections').addEventListener('click', async () => {
    const next = $$('#sects li').map(li => ({
      id: li.querySelector('input[type=checkbox]').dataset.id,
      visible: li.querySelector('input[type=checkbox]').checked,
      order: +li.querySelector('input[type=number]').value || 0
    }));
    await api('/api/admin/sections', { method: 'PUT', body: JSON.stringify(next) });
    status('ترتيب الأقسام اتحفظ ✔'); await load();
  });

  /* ── الوسائط ── */
  async function renderMedia() {
    const list = await api('/api/admin/media');
    $('#mediaList').innerHTML = '';
    list.forEach(m => {
      const li = document.createElement('li');
      li.innerHTML = `<img src="/${m.path}" alt=""><span class="mono">${m.path}</span>
        <span class="mono">${m.usedBy.length ? 'مستخدمة: ' + m.usedBy.join(',') : 'غير مستخدمة'}</span>`;
      const b = document.createElement('button'); b.className = 'btn btn--ghost mono'; b.textContent = 'حذف';
      b.addEventListener('click', async () => {
        try { await api(`/api/admin/media/${m.name}`, { method: 'DELETE' }); status('اتحذف ✔'); await load(); }
        catch (e) { status('⚠ مستخدمة في: ' + (e.body?.usedBy || []).join(', ')); }
      });
      li.appendChild(b); $('#mediaList').appendChild(li);
    });
  }
  $('#upBtn').addEventListener('click', async () => {
    const f = $('#upFile').files[0]; if (!f) return status('⚠ اختار ملف أولًا');
    const type = f.type.split('/')[1];
    const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    try { await api('/api/admin/media', { method: 'POST', body: JSON.stringify({ type, data }) }); status('اترفع ✔'); await load(); }
    catch (e) { status('⚠ ' + e.body?.error); }
  });

  /* ── الإعدادات ── */
  function renderSettings() {
    $('#s_seoTitle').value = DB.settings.seo.title[setLang] || '';
    $('#s_seoDesc').value = DB.settings.seo.desc[setLang] || '';
    $('#s_email').value = DB.settings.contact.email; $('#s_wa').value = DB.settings.contact.whatsapp;
    $('#s_gh').value = DB.settings.contact.github; $('#s_theme').value = DB.settings.theme;
  }
  $$('#setLangTabs button').forEach(b => b.addEventListener('click', () => {
    setLang = b.dataset.l; $$('#setLangTabs button').forEach(x => x.classList.toggle('is-on', x === b)); renderSettings();
  }));
  $('#saveSettings').addEventListener('click', async () => {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({
      seo: { title: { ...DB.settings.seo.title, [setLang]: $('#s_seoTitle').value },
             desc: { ...DB.settings.seo.desc, [setLang]: $('#s_seoDesc').value } },
      contact: { email: $('#s_email').value, whatsapp: $('#s_wa').value, github: $('#s_gh').value },
      theme: $('#s_theme').value }) });
    status('الإعدادات اتحفظت ✔'); await load();
  });

  /* ── السجل ── */
  function renderLog() {
    $('#logList').innerHTML = DB.changelog.map(l =>
      `<li><time>${l.at.slice(0, 16).replace('T', ' ')}</time><span>${l.action} · ${l.entity} · ${l.by}</span></li>`).join('');
  }

  /* ── جلسة موجودة؟ ── */
  api('/api/session').then(async r => {
    if (r.ok) { CSRF = r.csrf; $('#viewLogin').hidden = true; $('#viewApp').hidden = false; await load(); }
  }).catch(() => {});
})();
