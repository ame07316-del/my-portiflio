import type { ServerResponse } from 'node:http';
interface Subscriber { res: ServerResponse; tenant: string; }
export class RealtimeHub {
  readonly #subs = new Set<Subscriber>();
  published = 0;
  shedSlow = 0;
  get subscribers(): number { return this.#subs.size; }
  subscribe(res: ServerResponse, tenant: string): () => void {
    const entry: Subscriber = { res, tenant };
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    this.#subs.add(entry);
    const unsub = (): void => { this.#subs.delete(entry); };
    res.on('close', unsub);
    return unsub;
  }
  publish(tenant: string, topic: string, payload: unknown): void {
    this.published++;
    const frame = `event: ${topic}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const sub of this.#subs) {
      if (tenant !== '*' && sub.tenant !== '*' && sub.tenant !== tenant) continue;
      const ok = sub.res.write(frame);
      if (!ok) { this.shedSlow++; sub.res.destroy(); this.#subs.delete(sub); }
    }
  }
}
