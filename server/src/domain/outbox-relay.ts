/**
 * domain/outbox-relay.ts — transactional outbox publisher (Phase 3).
 *
 * Writes commit the outbox row in the SAME transaction as the state change
 * (adapter-enforced), so "state changed but no event" is impossible. The
 * relay then moves rows to downstream consumers at-least-once; consumers
 * hold the idempotency key and collapse duplicates. The decision banned
 * external brokers (Kafka/Redpanda), so the relay publishes into an
 * in-process consumer registry — the same contract a real broker client
 * would satisfy, swappable later.
 *
 * @complexity drain: Time O(rows × publish), Space O(batch).
 */
import type { LedgerStore, OutboxRow } from '../ports/store.js';

export type OutboxConsumer = (row: OutboxRow) => Promise<void> | void;

export class OutboxRelay {
  readonly #consumers: OutboxConsumer[] = [];

  constructor(
    private readonly store: LedgerStore,
    private readonly batchSize = 100,
  ) {}

  subscribe(consumer: OutboxConsumer): () => void {
    this.#consumers.push(consumer);
    return () => {
      const i = this.#consumers.indexOf(consumer);
      if (i >= 0) this.#consumers.splice(i, 1);
    };
  }

  /**
   * Deliver pending rows in id order and mark them sent. A consumer failure
   * stops the batch WITHOUT marking — the row stays pending (at-least-once).
   * Returns the number of rows delivered. @complexity O(rows).
   */
  async drain(): Promise<number> {
    let delivered = 0;
    for (;;) {
      const rows = await this.store.outboxPending(this.batchSize);
      if (rows.length === 0) break;
      for (const row of rows) {
        for (const c of this.#consumers) await c(row);
        await this.store.outboxMarkSent([row.id]);
        delivered++;
      }
      if (rows.length < this.batchSize) break;
    }
    return delivered;
  }
}
