/**
 * components/app-shell.ts — chrome around the live sections.
 *
 * The skeleton geometry ships in index.html; this module only binds status
 * pills and the HUD to state. No structural DOM changes happen after boot,
 * which is what guarantees CLS = 0.
 *
 * @complexity mount: O(1); per FSM transition: O(1) class swap via batcher.
 */

import type { AppEvent, AppPhase, StateMachine } from '../core/fsm.js';
import { scheduleWrite } from '../runtime/dom-batch.js';

export interface ShellRefs {
  hudFps: HTMLElement;
  hudHash: HTMLElement;
  hudWorker: HTMLElement;
}

export function mountAppShell(machine: StateMachine<AppPhase, AppEvent>, shared: boolean): ShellRefs {
  const pill = document.querySelector('[data-status-pill]') as HTMLElement;
  const mode = document.querySelector('[data-worker-mode]') as HTMLElement;

  const paint = (phase: AppPhase): void => {
    scheduleWrite('status-pill', () => {
      pill.textContent = phase;
      pill.dataset.phase = phase;
    });
  };
  paint(machine.state);
  machine.onTransition((_from, to) => paint(to));

  scheduleWrite('worker-mode', () => {
    mode.textContent = shared ? 'SharedWorker' : 'Worker';
  });

  return {
    hudFps: document.querySelector('[data-hud-fps]') as HTMLElement,
    hudHash: document.querySelector('[data-hud-hash]') as HTMLElement,
    hudWorker: document.querySelector('[data-hud-worker]') as HTMLElement,
  };
}
