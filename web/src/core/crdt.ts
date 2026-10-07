/**
 * core/crdt.ts — field-level Last-Writer-Wins (LWW) CRDT map.
 *
 * Conflict resolution is a TOTAL ORDER over (timestamp, actorId):
 * higher Lamport timestamp wins; ties break on higher actorId. Because the
 * winner depends only on the op's own stamp — not on arrival order — merge
 * is commutative, associative and idempotent: concurrent replicas converge
 * deterministically, which is exactly what the offline-first client and the
 * future sync server need (Phase 3 will keep these semantics end-to-end).
 *
 * Ops:
 *   { kind:'create', id, fields, ts, actor } — birth a record
 *   { kind:'set',    id, field, v, ts, actor } — upsert one field
 *   { kind:'del',    id, ts, actor }          — tombstone the record
 *
 * A newer 'set'/'create' revives a tombstoned record (tombstone stamp is
 * compared like any other write); a stale op against a tombstone is dropped.
 *
 * @complexity apply(op): Time O(1), Space O(1) (+ field cell on first write).
 * @complexity merge(batch of k ops): Time O(k), Space O(new cells).
 */

/** `null` is a FIELD TOMBSTONE — “the field is deleted” as a first-class LWW value. */
export type FieldValue = string | number | boolean | null;

export interface FieldCell {
  readonly v: FieldValue;
  readonly ts: number;
  readonly actor: number;
}

export type LwwOp =
  | { kind: 'create'; id: string; fields: Record<string, FieldValue>; ts: number; actor: number }
  | { kind: 'set'; id: string; field: string; v: FieldValue; ts: number; actor: number }
  | { kind: 'del'; id: string; ts: number; actor: number };

/**
 * Existence is decided by TWO monotonic stamps, never by mutation of a single
 * tombstone flag:
 *   live — stamp of the newest create/set applied to this record
 *   dead — stamp of the newest del applied to this record
 * alive ⇔ live ≠ null ∧ (dead = null ∨ live > dead)   (strict total order)
 *
 * Because both stamps only ever move forward, out-of-order or replayed ops
 * can never flip existence backwards — the randomized convergence test
 * enforces this for arbitrary permutations.
 */
interface RecordState {
  fields: Map<string, FieldCell>;
  live: FieldCell | null;
  dead: FieldCell | null;
}

/** Strict lexicographic stamp comparison: (ts, actor). @complexity O(1). */
export function stampAfter(a: { ts: number; actor: number }, b: { ts: number; actor: number }): boolean {
  return a.ts > b.ts || (a.ts === b.ts && a.actor > b.actor);
}

function isAlive(r: RecordState): boolean {
  return r.live !== null && (r.dead === null || stampAfter(r.live, r.dead));
}

/** Serializable snapshot shape (used for IndexedDB persistence + wire). */
export interface LwwSnapshot {
  records: Array<{
    id: string;
    live: FieldCell | null;
    dead: FieldCell | null;
    fields: Array<[string, FieldCell]>;
  }>;
}

export class LwwMap {
  readonly #records = new Map<string, RecordState>();

  get size(): number {
    return this.#records.size;
  }

  #slot(id: string): RecordState {
    let r = this.#records.get(id);
    if (r === undefined) {
      r = { fields: new Map(), live: null, dead: null };
      this.#records.set(id, r);
    }
    return r;
  }

  /**
   * Apply one op. Returns true when visible state changed.
   * @complexity Time O(1) (O(fields) for 'create'), Space O(1) amortized.
   */
  apply(op: LwwOp): boolean {
    // SYMMETRY RULE: field cells merge by stamp alone, existence merges by
    // stamp alone — neither path consults the other. Every stored datum is
    // therefore the order-independent MAX over applied stamps, which makes
    // full-state (not just visible-state) convergence provable.
    const r = this.#slot(op.id);
    const wasAlive = isAlive(r);
    switch (op.kind) {
      case 'create': {
        let cellChanged = false;
        for (const [field, v] of Object.entries(op.fields)) {
          const cur = r.fields.get(field);
          if (cur === undefined || stampAfter(op, cur)) {
            r.fields.set(field, { v, ts: op.ts, actor: op.actor });
            cellChanged = true;
          }
        }
        if (r.live === null || stampAfter(op, r.live)) {
          r.live = { v: true, ts: op.ts, actor: op.actor };
        }
        return cellChanged || wasAlive !== isAlive(r);
      }
      case 'set': {
        const cur = r.fields.get(op.field);
        if (cur !== undefined && !stampAfter(op, cur)) {
          // Stale cell. Note: liveness cannot change here — the op that
          // wrote the newer cell already advanced `live` past this stamp.
          return false;
        }
        r.fields.set(op.field, { v: op.v, ts: op.ts, actor: op.actor });
        if (r.live === null || stampAfter(op, r.live)) {
          r.live = { v: true, ts: op.ts, actor: op.actor };
        }
        return true;
      }
      case 'del': {
        if (r.dead !== null && !stampAfter(op, r.dead)) return false;
        r.dead = { v: true, ts: op.ts, actor: op.actor };
        return wasAlive !== isAlive(r);
      }
    }
  }

  /** Merge a remote batch. @complexity Time O(k) for k ops. */
  merge(ops: Iterable<LwwOp>): number {
    let changed = 0;
    for (const op of ops) if (this.apply(op)) changed++;
    return changed;
  }

  /** @complexity O(1). */
  isDeleted(id: string): boolean {
    const r = this.#records.get(id);
    return r !== undefined && !isAlive(r);
  }

  /**
   * Live (non-tombstoned) field value or undefined. Field tombstones
   * (v === null) read as absent. @complexity O(1).
   */
  getField(id: string, field: string): FieldValue | undefined {
    const r = this.#records.get(id);
    if (r === undefined || !isAlive(r)) return undefined;
    const v = r.fields.get(field)?.v;
    return v === null ? undefined : v;
  }

  /** Live field cells of one record (null if unknown/tombstoned). O(fields). */
  record(id: string): ReadonlyMap<string, FieldCell> | null {
    const r = this.#records.get(id);
    if (r === undefined || !isAlive(r)) return null;
    return r.fields;
  }

  /** All live record ids. @complexity Time O(n), Space O(n). */
  liveIds(): string[] {
    const out: string[] = [];
    for (const [id, r] of this.#records) if (isAlive(r)) out.push(id);
    return out;
  }

  /** Deterministic serializable dump. @complexity Time O(cells), Space O(cells). */
  snapshot(): LwwSnapshot {
    const records: LwwSnapshot['records'] = [];
    for (const [id, r] of [...this.#records.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      records.push({
        id,
        live: r.live,
        dead: r.dead,
        fields: [...r.fields.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
      });
    }
    return { records };
  }

  /** Restore from a snapshot. @complexity Time O(cells), Space O(cells). */
  load(snap: LwwSnapshot): void {
    this.#records.clear();
    for (const rec of snap.records) {
      this.#records.set(rec.id, { live: rec.live, dead: rec.dead, fields: new Map(rec.fields) });
    }
  }
}

/**
 * Monotonic Lamport clock: always strictly greater than anything observed.
 * @complexity O(1).
 */
export class LamportClock {
  #ts: number;
  constructor(
    readonly actor: number,
    start = 0,
  ) {
    this.#ts = start;
  }

  tick(): number {
    return ++this.#ts;
  }

  observe(remoteTs: number): void {
    if (remoteTs > this.#ts) this.#ts = remoteTs;
  }

  get current(): number {
    return this.#ts;
  }
}
