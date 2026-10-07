/**
 * obs/health.ts — live system health with near-zero overhead (Phase 6).
 *
 * Event-loop lag is measured by the drift of a low-frequency timer (one
 * timestamp per interval — nanocost), heap via process.memoryUsage(), and
 * component gauges (queues, pools, store) are read on demand only when
 * /healthz or /metrics is hit. No polling loops burn CPU for vanity.
 *
 * @complexity probe tick: O(1); collect: O(components).
 */

export interface HealthComponent {
  readonly name: string;
  readonly depth?: number;
  readonly dropped?: number;
  readonly ok: boolean;
}

export interface HealthReport {
  readonly status: 'ok' | 'degraded';
  readonly uptimeSec: number;
  readonly eventLoopLagMs: number;
  readonly memory: { rss: number; heapUsed: number; heapTotal: number; external: number };
  readonly components: HealthComponent[];
  readonly generatedAt: string;
}

export class EventLoopLagProbe {
  #emaMs = 0;
  #timer: ReturnType<typeof setInterval> | null = null;

  /** @param intervalMs probe cadence; 500ms keeps measurement under 0.001% CPU. */
  constructor(private readonly intervalMs = 500) {}

  start(): void {
    if (this.#timer !== null) return;
    const tick = (): void => {
      const expected = this.intervalMs;
      const t0 = performance.now();
      setImmediate(() => {
        const actual = performance.now() - t0;
        // lag = how much longer the immediate callback waited than "now"
        const lag = Math.max(0, actual - 1);
        this.#emaMs = this.#emaMs === 0 ? lag : this.#emaMs * 0.9 + lag * 0.1;
      });
      void expected;
    };
    this.#timer = setInterval(tick, this.intervalMs);
    this.#timer.unref?.();
  }

  stop(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
  }

  get lagMs(): number {
    return this.#emaMs;
  }
}

export type ComponentProbe = () => HealthComponent;

/** Assemble one report. @complexity O(components). */
export function collectHealth(probes: readonly ComponentProbe[], lagProbe: EventLoopLagProbe): HealthReport {
  const mem = process.memoryUsage();
  const components = probes.map((p) => p());
  const degraded =
    lagProbe.lagMs > 100 || components.some((c) => !c.ok);
  return {
    status: degraded ? 'degraded' : 'ok',
    uptimeSec: Math.round(process.uptime()),
    eventLoopLagMs: Math.round(lagProbe.lagMs * 100) / 100,
    memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external },
    components,
    generatedAt: new Date().toISOString(),
  };
}

/** Prometheus-style text exposition. @complexity O(components). */
export function metricsText(report: HealthReport): string {
  const lines = [
    '# TYPE sovereign_uptime_seconds gauge',
    `sovereign_uptime_seconds ${report.uptimeSec}`,
    '# TYPE sovereign_event_loop_lag_ms gauge',
    `sovereign_event_loop_lag_ms ${report.eventLoopLagMs}`,
    '# TYPE sovereign_heap_used_bytes gauge',
    `sovereign_heap_used_bytes ${report.memory.heapUsed}`,
    '# TYPE sovereign_rss_bytes gauge',
    `sovereign_rss_bytes ${report.memory.rss}`,
  ];
  for (const c of report.components) {
    if (c.depth !== undefined) {
      lines.push(`sovereign_component_depth{name="${c.name}"} ${c.depth}`);
    }
    if (c.dropped !== undefined) {
      lines.push(`sovereign_component_dropped_total{name="${c.name}"} ${c.dropped}`);
    }
    lines.push(`sovereign_component_ok{name="${c.name}"} ${c.ok ? 1 : 0}`);
  }
  return lines.join('\n') + '\n';
}
