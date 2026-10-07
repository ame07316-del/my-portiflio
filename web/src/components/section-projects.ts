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
 * @complexity render pass: O(items); per gesture: O(1) dispatch.
 */

import type { FieldValue } from '../core/crdt.js';
import { scheduleWrite } from '../runtime/dom-batch.js';
import { effect } from '../runtime/signal.js';
import type { StoreHandle } from '../client/store.js';
import { reconcileKeyed } from './keyed-list.js';

interface RowItem {
  title: string;
  status: string;
  pending: boolean;
}

export function mountProjects(host: HTMLElement, store: StoreHandle): void {
  host.innerHTML = `
    <div class="panel-head"><h2>Projects — المشاريع</h2><span class="hint">optimistic · CRDT · offline-first</span></div>
    <form class="p-form">
      <input class="p-new" type="text" maxlength="120" placeholder="New project title… (try it — 15% of commits fail on purpose)" />
      <button type="submit" class="btn">Add</button>
    </form>
    <ul class="plist"></ul>
    <div class="toast" hidden></div>`;

  const list = host.querySelector('.plist') as HTMLUListElement;
  const form = host.querySelector('.p-form') as HTMLFormElement;
  const newInput = host.querySelector('.p-new') as HTMLInputElement;
  const toast = host.querySelector('.toast') as HTMLDivElement;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

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
    store.sendCreate({ title, summary: '', status: 'draft', sort: maxSort + 1 });
    newInput.value = '';
  });

  function buildRow(key: string, item: RowItem): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'p-row';
    li.innerHTML = `
      <span class="p-dot" aria-hidden="true"></span>
      <input class="p-title" type="text" maxlength="120" />
      <button class="p-status btn" type="button"></button>
      <button class="p-del btn" type="button" aria-label="delete">✕</button>`;
    const input = li.querySelector('.p-title') as HTMLInputElement;
    const status = li.querySelector('.p-status') as HTMLButtonElement;
    const del = li.querySelector('.p-del') as HTMLButtonElement;

    input.addEventListener('change', () => {
      const v = input.value.trim();
      if (v !== '') store.sendSet(key, 'title', v);
    });
    status.addEventListener('click', () => {
      store.sendSet(key, 'status', status.textContent === 'live' ? 'draft' : 'live');
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
    status.textContent = item.status;
    status.classList.toggle('live', item.status === 'live');
    li.classList.toggle('pending', item.pending);
  }

  /** Derive sorted rows from the store. O(n log n) sort on tiny n. */
  function render(): void {
    const recs = store.records.get();
    const pend = store.pending.get();
    const rows: Array<[string, RowItem & { sort: number }]> = [];
    for (const [id, rec] of recs) {
      const sort = rec.get('sort');
      rows.push([
        id,
        {
          title: String(rec.get('title') ?? ''),
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
