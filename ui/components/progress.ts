// Step list: one row per step, a spinner while it runs, a check when done, a red cross when it fails. Owner: A11.
// Rows come from the main process `step` events (StepView); a later event for the same id updates that row in place,
// so 「再试一次」 keeps the rows already ticked (O-03).
import type { StepView } from '../../electron/main/ipc-contract.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';

export interface Progress {
  el: HTMLElement;
  update(step: StepView): void;
}

const MARK: Record<StepView['state'], string> = { start: '', done: '✓', fail: '✕' };

export function createProgress(): Progress {
  useStyle('progress.css');
  const el = h('ol', { class: 'progress' });
  const rows = new Map<string, { row: HTMLElement; mark: HTMLElement; text: HTMLElement }>();
  return {
    el,
    update(step) {
      let r = rows.get(step.id);
      if (!r) {
        const mark = h('span', { class: 'progress-mark', 'aria-hidden': 'true' });
        const text = h('span', { class: 'progress-text' });
        const row = h('li', { class: 'progress-row', 'data-testid': TID.onboarding.step(step.id) }, mark, text);
        r = { row, mark, text };
        rows.set(step.id, r);
        el.append(row);
      }
      r.row.dataset.state = step.state;
      r.mark.textContent = MARK[step.state];
      r.text.textContent = step.text;
    },
  };
}

/** Links a stylesheet once (CSP allows 'self' stylesheets only, no inline <style>). href is relative to index.html. */
export function useStyle(href: string): void {
  if (document.head.querySelector(`link[data-style="${href}"]`)) return;
  document.head.append(h('link', { rel: 'stylesheet', href, 'data-style': href }));
}
