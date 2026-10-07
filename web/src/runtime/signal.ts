/**
 * runtime/signal.ts — fine-grained reactive primitives (push-mark, pull-run).
 *
 * Why not a framework renderer: with signals, a state change touches ONLY
 * the exact computations and DOM nodes subscribed to it — there is no virtual
 * DOM diff and no component re-render fan-out. Combined with the DOM batcher
 * in dom-batch.ts this keeps Main-Thread work per frame far under 16 ms.
 *
 * Model:
 *  - `signal(v)`  — writable source.
 *  - `computed(f)`— lazy cached derivation; recomputes only when a dep is
 *                   dirty AND someone reads it (pull-based).
 *  - `effect(f)`  — eager subscription; re-runs at most once per flush no
 *                   matter how many of its deps changed (Set dedup).
 *  - `batch(f)`   — coalesces all writes inside `f` into ONE flush.
 *
 * Effects are queued on a microtask flush by default; `flushSignals()` forces
 * a synchronous drain (used by tests and by the worker-patch ingestion path).
 *
 * @complexity signal.set: Time O(1) marking + O(dirty edges) on flush.
 * @complexity computed.get: Time O(body) on recompute, O(1) when cached.
 * @complexity Space: O(edges) for the dependency graph.
 */

interface Reaction {
  run(): void;
  deps: Set<SignalImpl<unknown>>;
  queued: boolean;
  active: boolean;
}

class SignalImpl<T> {
  #value: T;
  readonly subs = new Set<Reaction>();

  constructor(value: T) {
    this.#value = value;
  }

  get value(): T {
    if (currentReaction !== null) {
      this.subs.add(currentReaction);
      currentReaction.deps.add(this);
    }
    return this.#value;
  }

  set value(next: T) {
    if (Object.is(this.#value, next)) return; // equality short-circuit
    this.#value = next;
    for (const s of this.subs) enqueue(s);
  }

  peek(): T {
    return this.#value;
  }

  unlink(r: Reaction): void {
    this.subs.delete(r);
  }
}

export interface Signal<T> {
  get(): T;
  set(v: T): void;
  peek(): T;
}

export interface ReadonlySignal<T> {
  get(): T;
  peek(): T;
}

let currentReaction: Reaction | null = null;
let batchDepth = 0;
let flushScheduled = false;
const pending: Reaction[] = [];

function enqueue(r: Reaction): void {
  if (!r.active || r.queued) return;
  r.queued = true;
  pending.push(r);
  if (batchDepth === 0 && !flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flushSignals);
  }
}

/**
 * Drain all queued reactions once each. Re-runs are tracked against fresh
 * dependency sets, so a reaction whose deps changed mid-flush still settles.
 * @complexity Time O(reactions × body), Space O(1) beyond reactions.
 */
export function flushSignals(): void {
  flushScheduled = false;
  // Fixed-point: reactions may dirty other reactions while running.
  for (let guard = 0; pending.length > 0; guard++) {
    if (guard > 1000) throw new Error('signal flush did not settle (cycle?)');
    const r = pending.shift() as Reaction;
    r.queued = false;
    if (!r.active) continue;
    runReaction(r);
  }
}

function runReaction(r: Reaction): void {
  for (const d of r.deps) d.unlink(r);
  r.deps.clear();
  const prev = currentReaction;
  currentReaction = r;
  try {
    r.run();
  } finally {
    currentReaction = prev;
  }
}

/** Coalesce every write inside `fn` into a single flush. O(body). */
export function batch(fn: () => void): void {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && pending.length > 0 && !flushScheduled) {
      flushScheduled = true;
      queueMicrotask(flushSignals);
    }
  }
}

export function signal<T>(initial: T): Signal<T> {
  const impl = new SignalImpl<T>(initial);
  return {
    get: () => impl.value,
    set: (v: T) => {
      impl.value = v;
    },
    peek: () => impl.peek(),
  };
}

export function computed<T>(fn: () => T): ReadonlySignal<T> {
  let cache: T;
  let dirty = true;
  const reaction: Reaction = {
    run: () => {
      dirty = true;
    },
    deps: new Set(),
    queued: false,
    active: true,
  };
  // Dirty-marking reaction: when a dep changes, mark + propagate to subs.
  const impl = {
    subs: new Set<Reaction>(),
  };
  const originalRun = reaction.run;
  reaction.run = () => {
    originalRun();
    for (const s of impl.subs) enqueue(s);
  };
  return {
    get(): T {
      if (currentReaction !== null) impl.subs.add(currentReaction);
      if (dirty) {
        for (const d of reaction.deps) d.unlink(reaction);
        reaction.deps.clear();
        const prev = currentReaction;
        currentReaction = reaction;
        try {
          cache = fn();
        } finally {
          currentReaction = prev;
        }
        dirty = false;
      }
      return cache;
    },
    peek(): T {
      return cache;
    },
  };
}

/**
 * Eager effect; returns a disposer. The effect re-runs at most once per
 * flush regardless of how many dependencies changed.
 * @complexity per run: O(body); registration/disposal O(deps).
 */
export function effect(fn: () => void): () => void {
  const reaction: Reaction = { run: fn, deps: new Set(), queued: false, active: true };
  runReaction(reaction);
  return () => {
    reaction.active = false;
    for (const d of reaction.deps) d.unlink(reaction);
    reaction.deps.clear();
  };
}
