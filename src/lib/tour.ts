/**
 * The guided-tour engine. Kept free of React so it can be unit tested and so
 * the component stays a thin shell around it.
 */

export type TourStop = { id: string; label: string };

export type TourTimings = {
  dive: number;
  holdBottom: number;
  travel: number;
  hold: number;
  home: number;
};

export const DEFAULT_TIMINGS: TourTimings = {
  dive: 2100,
  holdBottom: 900,
  travel: 1250,
  hold: 1500,
  home: 1400,
};

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Works no matter which element the browser treats as the scroller. */
export function scrollTop(): number {
  return (
    window.scrollY ||
    document.scrollingElement?.scrollTop ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  );
}

export function setScrollTop(y: number) {
  const value = Math.max(0, Math.round(y));
  window.scrollTo(0, value);
  // belt and braces — some layouts scroll an element instead of the window
  const el = document.scrollingElement ?? document.documentElement;
  if (el && Math.abs(el.scrollTop - value) > 1) el.scrollTop = value;
}

export function maxScroll(): number {
  const doc = document.documentElement;
  const body = document.body;
  const height = Math.max(
    doc.scrollHeight,
    body?.scrollHeight ?? 0,
    doc.offsetHeight,
    body?.offsetHeight ?? 0,
  );
  return Math.max(0, height - window.innerHeight);
}

/** Scroll position that puts an element in the middle of the viewport. */
export function centerOf(id: string): number | null {
  const el = document.getElementById(id);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const top = rect.top + scrollTop();
  const wanted = top + rect.height / 2 - window.innerHeight / 2;
  return Math.max(0, Math.min(maxScroll(), wanted));
}

const frame = (cb: (t: number) => void) =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(cb)
    : (setTimeout(() => cb(Date.now()), 16) as unknown as number);

export function glideTo(
  target: number,
  duration: number,
  isCancelled: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const start = scrollTop();
    const delta = target - start;

    if (duration <= 0 || Math.abs(delta) < 2) {
      setScrollTop(target);
      resolve();
      return;
    }

    const t0 = performance.now();
    let lastY = start;
    let stalls = 0;

    const step = (now: number) => {
      if (isCancelled()) {
        resolve();
        return;
      }
      const t = Math.min(1, (now - t0) / duration);
      const y = start + delta * easeInOutCubic(t);
      setScrollTop(y);

      // watchdog: if the page refuses to move, stop animating and jump
      const actual = scrollTop();
      if (t > 0.15 && Math.abs(actual - lastY) < 0.5) stalls++;
      else stalls = 0;
      lastY = actual;
      if (stalls > 20) {
        setScrollTop(target);
        resolve();
        return;
      }

      if (t < 1) frame(step);
      else resolve();
    };

    frame(step);
  });
}

export function wait(ms: number, isCancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (isCancelled() || performance.now() - t0 >= ms) resolve();
      else frame(tick);
    };
    frame(tick);
  });
}

export type TourCallbacks = {
  onStep?: (index: number, stop: TourStop | null) => void;
  onProgress?: (ratio: number) => void;
};

/**
 * Dives to the very bottom of the page, then climbs back up stopping on every
 * section, and finally lands at the top.
 */
export async function runGuidedTour(
  stops: TourStop[],
  isCancelled: () => boolean,
  callbacks: TourCallbacks = {},
  timings: Partial<TourTimings> = {},
  instant = false,
) {
  const t = { ...DEFAULT_TIMINGS, ...timings };
  const order = [...stops].reverse(); // bottom → top
  const dur = (ms: number) => (instant ? 0 : ms);

  callbacks.onStep?.(0, order[0] ?? null);
  await glideTo(maxScroll(), dur(t.dive), isCancelled);
  if (!isCancelled()) await wait(t.holdBottom, isCancelled);

  for (let i = 0; i < order.length; i++) {
    if (isCancelled()) break;
    const y = centerOf(order[i].id);
    if (y === null) continue;
    callbacks.onStep?.(i + 1, order[i]);
    await glideTo(y, dur(t.travel), isCancelled);
    if (isCancelled()) break;
    await wait(t.hold, isCancelled);
  }

  callbacks.onStep?.(0, null);
  await glideTo(0, isCancelled() ? 600 : dur(t.home), () => false);
}
