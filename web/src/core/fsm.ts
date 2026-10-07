/**
 * core/fsm.ts — typed finite state machine for application lifecycle.
 *
 * The machine's transition table is a plain object lookup: `send()` is an
 * O(1) table probe + O(listeners) notification. Illegal transitions throw
 * instead of being silently absorbed — the system fails loudly, never weirdly.
 *
 * @complexity send: Time O(1) + O(listeners), Space O(1).
 * @complexity onTransition: Time O(1) to register, O(1) to dispose.
 */

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly event: string,
  ) {
    super(`illegal transition: ${from} --${event}--> ∅`);
    this.name = 'IllegalTransitionError';
  }
}

export type TransitionTable<S extends string, E extends string> = Partial<
  Record<S, Partial<Record<E, S>>>
>;

export class StateMachine<S extends string, E extends string> {
  #state: S;
  readonly #table: TransitionTable<S, E>;
  readonly #listeners = new Set<(from: S, to: S, event: E) => void>();

  constructor(initial: S, table: TransitionTable<S, E>) {
    this.#state = initial;
    this.#table = table;
  }

  get state(): S {
    return this.#state;
  }

  /** O(1) probe; throws `IllegalTransitionError` on an illegal event. */
  send(event: E): S {
    const next = this.#table[this.#state]?.[event];
    if (next === undefined) throw new IllegalTransitionError(this.#state, event);
    const from = this.#state;
    this.#state = next;
    for (const l of this.#listeners) l(from, next, event);
    return next;
  }

  canSend(event: E): boolean {
    return this.#table[this.#state]?.[event] !== undefined;
  }

  onTransition(fn: (from: S, to: S, event: E) => void): () => void {
    this.#listeners.add(fn);
    return () => {
      this.#listeners.delete(fn);
    };
  }
}

/* ------------------------------------------------------------------ */
/* Application lifecycle machine                                       */
/* ------------------------------------------------------------------ */

export type AppPhase = 'boot' | 'loading' | 'ready' | 'degraded' | 'fatal';
export type AppEvent = 'START_LOAD' | 'LOADED' | 'DEGRADE' | 'RECOVER' | 'FAIL' | 'RESET';

export const APP_TABLE: TransitionTable<AppPhase, AppEvent> = {
  boot: { START_LOAD: 'loading', FAIL: 'fatal' },
  loading: { LOADED: 'ready', DEGRADE: 'degraded', FAIL: 'fatal' },
  ready: { DEGRADE: 'degraded', FAIL: 'fatal' },
  degraded: { RECOVER: 'ready', FAIL: 'fatal' },
  fatal: { RESET: 'boot' },
};

/** Factory with the app lifecycle table pre-wired. @complexity O(1). */
export function createAppMachine(): StateMachine<AppPhase, AppEvent> {
  return new StateMachine<AppPhase, AppEvent>('boot', APP_TABLE);
}
