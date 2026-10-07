/**
 * components/keyed-list.ts — keyed DOM reconciliation.
 *
 * The cheapest renderer that can exist: existing nodes are kept and mutated
 * in place; nodes are created/deleted only when keys appear/disappear. No
 * virtual DOM, no diffing tree allocation, no innerHTML churn.
 *
 * @complexity per pass: Time O(n + m) (n desired keys, m live nodes),
 * Space O(n) index map — reused every frame (allocated once, cleared).
 */

const scratch = new Map<string, Element>();

export interface KeyedListHooks<E extends HTMLElement, T> {
  build(key: string, item: T): E;
  update(el: E, key: string, item: T): void;
  order?: (a: T, b: T) => number;
}

export function reconcileKeyed<E extends HTMLElement, T>(
  container: HTMLElement,
  items: ReadonlyArray<[string, T]>,
  hooks: KeyedListHooks<E, T>,
): void {
  scratch.clear();
  for (const child of Array.from(container.children)) scratch.set(child.getAttribute('data-key') ?? '', child);

  let prev: Element | null = null;
  for (const [key, item] of items) {
    let el = scratch.get(key) as E | undefined;
    if (el === undefined) {
      el = hooks.build(key, item);
      el.setAttribute('data-key', key);
    } else {
      scratch.delete(key);
      hooks.update(el, key, item);
    }
    const wantAfter: ChildNode | null = prev === null ? container.firstChild : prev.nextSibling;
    if (el !== wantAfter) {
      container.insertBefore(el, wantAfter);
    }
    prev = el;
  }
  for (const stale of scratch.values()) stale.remove();
}
