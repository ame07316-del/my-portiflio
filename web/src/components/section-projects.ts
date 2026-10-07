/**
 * components/section-projects.ts — optimistic CRUD over the CRDT store.
 *
 * Every user gesture dispatches an op and returns immediately (Optimistic
 * UI). The worker acks → `pending` shrinks; a rejection arrives with the
 * worker ALREADY having applied inverse ops, so the next Patch paints the
 * reverted state — the UI never hand-rolls an undo.
 *
 * Skeleton→content geometry is identical (56 px rows), so hydration causes
 * zero layout shift. DOM writes go through the keyed reconciler inside the
 * rAF batcher — the Main Thread only paints.
 *
 * Phase 7: bilingual — every static string routes through the i18n dict
 * (EN/AR), new projects write the active-locale field, and display prefers
 * the Arabic title when present.
 *
 * @complexity render pass: O(items); per gesture: O(1) dispatch.
 */

import type { FieldValue } from '../core/crdt.js';
import { scheduleWrite } from '../runtime/dom-batch.js';
import { effect } from '../runtime/signal.js';
import { locale, localized, t } from '../runtime/i18n.js';
import type { StoreHandle } from '../client/store.js';
import { reconcileKeyed } from './keyed-list.js';

interface RowItem {
  title: string;
  status: string;
  pending: boolean;
}

export function mountProjects(host: HTMLElement, store: StoreHandle): void {
  // No static text in the template — the i18n effects below fill everything
  // for the active locale (geometry stays reserved: zero CLS).
  host.innerHTML = `
    <div class="panel-head"><h2 class="p-heading"></h2><span class="hint p-hint"></span></div>
    <form class="p-form">
      <input class="p-new" type="text" maxlength="120" placeholder="" />
      <button type="submit" class="btn p-add"></button>
    </form>
    <ul class="plist"></ul>
    <div class="toast" hidden></div>`;

  const list = host.querySelector('.plist') as HTMLUListElement;
  const form = host.querySelector('.p-form') as HTMLFormElement;
  const newInput = host.querySelector('.p-new') as HTMLInputElement;
  const addBtn = host.querySelector('.p-add') as HTMLButtonElement;
  const heading = host.querySelector('.p-heading') as HTMLElement;
  const hint = host.querySelector('.p-hint') as HTMLElement;
  const toast = host.querySelector('.toast') as HTMLDivElement;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  // Chrome i18n: re-runs ONLY when the locale signal changes.
  effect(() => {
    locale.get();
    scheduleWrite('projects-chrome', () => {
      heading.textContent = t('projects_title');
      hint.textContent = t('projects_hint');
      newInput.placeholder = t('add_placeholder');
      addBtn.textContent = t('add_button');
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = newInput.value.trim();
    if (title === '') return;
    const recs = store.records.peek();
    let maxSort = 0;
    for (const r of recs.values()) {
      const s = r.get('sort');
      if (typeof s === 'number' && s > maxSort) maxSort = s;
    }
    // The typed value lands in the ACTIVE locale's field; the other is ''.
    const ar = locale.peek() === 'ar';
    const fields: Record<string, FieldValue> = {
      title: ar ? '' : title,
      title_ar: ar ? title : '',
      summary: '',
      status: 'draft',
      sort: maxSort + 1,
    };
    store.sendCreate(fields);
    newInput.value = '';
  });

  function buildRow(key: string, item: RowItem): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'p-row';
    li.innerHTML = `
      <span class="p-dot" aria-hidden="true"></span>
      <input class="p-title" type="text" maxlength="120" />
      <button class="p-status btn" type="button"></button>
      <button class="p-del btn" type="button" aria-label="${t('delete_aria')}">✕</button>`;
    const input = li.querySelector('.p-title') as HTMLInputElement;
    const status = li.querySelector('.p-status') as HTMLButtonElement;
    const del = li.querySelector('.p-del') as HTMLButtonElement;

    input.addEventListener('change', () => {
      const v = input.value.trim();
      if (v !== '') store.sendSet(key, locale.peek() === 'ar' ? 'title_ar' : 'title', v);
    });
    status.addEventListener('click', () => {
      store.sendSet(key, 'status', status.dataset.status === 'live' ? 'draft' : 'live');
    });
    del.addEventListener('click', () => {
      store.sendDel(key);
    });
    updateRow(li, key, item);
    return li;
  }

  function updateRow(li: HTMLLIElement, _key: string, item: RowItem): void {
    const input = li.querySelector('.p-title') as HTMLInputElement;
    // Never steal an in-progress edit: only sync when not focused.
    if (document.activeElement !== input && input.value !== item.title) {
      input.value = item.title;
    }
    const status = li.querySelector('.p-status') as HTMLButtonElement;
    status.dataset.status = item.status;
    status.textContent = item.status === 'live' ? t('status_live') : t('status_draft');
    status.classList.toggle('live', item.status === 'live');
    li.classList.toggle('pending', item.pending);
  }

  /** Derive sorted rows from the store. O(n log n) sort on tiny n. */
  function render(): void {
    const recs = store.records.get();
    const pend = store.pending.get();
    locale.get(); // dependency: re-render on locale switch (title language)
    const rows: Array<[string, RowItem & { sort: number }]> = [];
    for (const [id, rec] of recs) {
      const sort = rec.get('sort');
      rows.push([
        id,
        {
          title: localized(String(rec.get('title') ?? ''), String(rec.get('title_ar') ?? '')),
          status: String(rec.get('status') ?? 'draft'),
          pending: false,
          sort: typeof sort === 'number' ? sort : 0,
        },
      ]);
    }
    rows.sort((a, b) => a[1].sort - b[1].sort || (a[0] < b[0] ? -1 : 1));
    // pending = ANY op in flight (op→row mapping is worker-side; coarse by design)
    const anyPending = pend.size > 0;
    const items: Array<[string, RowItem]> = rows.map(([id, r]) => [id, { title: r.title, status: r.status, pending: anyPending }]);
    scheduleWrite('projects-list', () => {
      reconcileKeyed<HTMLLIElement, RowItem>(list, items, { build: buildRow, update: updateRow });
    });
  }

  effect(render);

  // Rollback toast — the data is already reverted by the Patch.
  effect(() => {
    const rej = store.rejected.get();
    if (rej === null) return;
    scheduleWrite('projects-toast', () => {
      toast.hidden = false;
      toast.textContent = `↩ commit rejected (${rej.code}) — op #${rej.opId} rolled back automatically`;
      if (toastTimer !== null) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        scheduleWrite('projects-toast-hide', () => {
          toast.hidden = true;
        });
      }, 2600);
    });
  });
}

/** Convenience typed getter used by other components. O(1). */
export function fieldOf(rec: ReadonlyMap<string, FieldValue> | undefined, k: string): FieldValue | undefined {
  return rec?.get(k);
}
