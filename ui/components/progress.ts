// Step list: one row per step, a spinner while it runs, a check when done, a red cross when it fails. Owner: A11.
// Rows come from the main process `step` events (StepView); a later event for the same id updates that row in place,
// so 「再试一次」 keeps the rows already ticked (O-03).
// The ring above the list (ui-design/app install v5) shows the whole install: done steps out of the steps seen (at least
// EXPECTED_STEPS, since steps appear one by one), plus the running step's own percent when its text has one; it never
// goes back.
import type { StepView } from '../../electron/main/ipc-contract.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';

export interface Progress {
  el: HTMLElement;
  /** The ring with the overall percent */
  ring: HTMLElement;
  update(step: StepView): void;
}

/** Mac installs in 3 steps (download, copy, check); Windows reports its own, often more */
const EXPECTED_STEPS = 3;
const R = 46;
const C = 2 * Math.PI * R;

/** Overall percent from each step's state; a running step counts its own N% when the text carries one */
export function overallPercent(steps: { state: StepView['state']; text: string }[]): number {
  const total = Math.max(EXPECTED_STEPS, steps.length);
  const got = steps.reduce((sum, s) => {
    if (s.state === 'done') return sum + 1;
    const m = /(\d{1,3})\s*%/.exec(s.text);
    return sum + (s.state === 'start' && m ? Math.min(100, Number(m[1])) / 100 : 0);
  }, 0);
  return Math.round((got / total) * 100);
}

const MARK: Record<StepView['state'], string> = { start: '', done: '✓', fail: '✕' };

export function createProgress(): Progress {
  const el = h('ol', { class: 'progress' });
  const rows = new Map<string, { row: HTMLElement; mark: HTMLElement; text: HTMLElement }>();
  const steps = new Map<string, { state: StepView['state']; text: string }>();
  const ring = h('div', { class: 'progress-ring', 'data-testid': TID.onboarding.ring });
  ring.innerHTML = `<svg viewBox="0 0 104 104" aria-hidden="true"><circle class="track" cx="52" cy="52" r="${R}"/><circle class="bar" cx="52" cy="52" r="${R}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}"/></svg>`;
  const pctText = h('b', {}, '0', h('small', {}, '%'));
  ring.append(pctText);
  let shown = 0;
  return {
    el,
    ring,
    update(step) {
      steps.set(step.id, { state: step.state, text: step.text });
      shown = Math.max(shown, overallPercent([...steps.values()]));
      ring.querySelector('.bar')!.setAttribute('stroke-dashoffset', (C * (1 - shown / 100)).toFixed(2));
      pctText.replaceChildren(String(shown), h('small', {}, '%'));
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
