/**
 * security/sessions.ts — memory-safe session registry (Phase 4 + 5).
 *
 * Sessions are attached to OBJECT IDENTITY via WeakMap: when the caller
 * drops its handle, the session entry becomes collectable instantly — there
 * is no string-keyed Map slowly leaking every session the server has ever
 * seen (the classic retained-memory leak). A secondary WeakRef-based sweep
 * covers token→handle lookups without pinning handles alive.
 *
 * @complexity issue/get/revoke: Time O(1); Space O(live sessions only).
 */

export interface Session {
  readonly tenant: string;
  readonly subjectId: string;
  readonly role: string;
  readonly issuedAt: number;
}

export class SessionRegistry {
  readonly #byHandle = new WeakMap<object, Session>();
  readonly #handles = new Map<string, WeakRef<object>>();

  /** Bind a fresh session to a new opaque handle object. O(1). */
  issue(token: string, session: Session): object {
    const handle = Object.freeze({ kind: 'session-handle' });
    this.#byHandle.set(handle, session);
    this.#handles.set(token, new WeakRef(handle));
    return handle;
  }

  /** Resolve a token; expired/collected handles yield undefined. O(1). */
  resolve(token: string): { handle: object; session: Session } | undefined {
    const ref = this.#handles.get(token);
    if (ref === undefined) return undefined;
    const handle = ref.deref();
    if (handle === undefined) {
      this.#handles.delete(token); // GC already took it — prune index entry
      return undefined;
    }
    const session = this.#byHandle.get(handle);
    if (session === undefined) return undefined;
    return { handle, session };
  }

  /** Explicit revocation. O(1). */
  revoke(token: string): void {
    const ref = this.#handles.get(token);
    const handle = ref?.deref();
    if (handle !== undefined) this.#byHandle.delete(handle);
    this.#handles.delete(token);
  }

  get indexedTokens(): number {
    return this.#handles.size;
  }
}
