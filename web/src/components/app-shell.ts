import type { AppEvent, AppPhase, StateMachine } from '../core/fsm.js';
import { scheduleWrite } from '../runtime/dom-batch.js';
import { effect } from '../runtime/signal.js';
import { applyDirection, dir, locale, setLocale, t, type Locale } from '../runtime/i18n.js';
export interface ShellRefs { hudFps: HTMLElement; hudHash: HTMLElement; hudWorker: HTMLElement; }
export function mountAppShell(machine: StateMachine<AppPhase, AppEvent>, shared: boolean): ShellRefs {
  const pill = document.querySelector('[data-status-pill]') as HTMLElement;
  const mode = document.querySelector('[data-worker-mode]') as HTMLElement;
  const switcher = document.querySelector('[data-locale-switch]') as HTMLButtonElement | null;
  const paint = (phase: AppPhase): void => {
    scheduleWrite('status-pill', () => { pill.textContent = phase; pill.dataset.phase = phase; });
  };
  paint(machine.state);
  machine.onTransition((_from, to) => paint(to));
  scheduleWrite('worker-mode', () => { mode.textContent = shared ? 'SharedWorker' : 'Worker'; });
  applyDirection();
  if (switcher !== null) {
    switcher.addEventListener('click', () => { setLocale(locale.peek() === 'ar' ? 'en' : 'ar'); });
  }
  effect(() => {
    const d = dir.get();
    scheduleWrite('locale-dir', () => {
      document.documentElement.setAttribute('dir', d);
      document.documentElement.lang = locale.peek();
      if (switcher !== null) { switcher.textContent = t('locale_switch'); switcher.setAttribute('aria-label', t('locale_switch_aria')); }
    });
  });
  effect(() => {
    locale.get();
    scheduleWrite('i18n-static', () => {
      for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
        const key = el.dataset.i18n;
        if (key !== undefined) el.textContent = t(key);
      }
    });
  });
  return {
    hudFps: document.querySelector('[data-hud-fps]') as HTMLElement,
    hudHash: document.querySelector('[data-hud-hash]') as HTMLElement,
    hudWorker: document.querySelector('[data-hud-worker]') as HTMLElement,
  };
}
export type { Locale };
