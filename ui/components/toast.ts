// Toast: one line at the bottom, gone after a few seconds. Owner: Base.
import { h } from '../dom.js';
import { TID } from '../testids.js';

export function toast(text: string, opts: { error?: boolean; ms?: number; root?: HTMLElement } = {}): HTMLElement {
  const root = opts.root ?? document.body;
  root.querySelector(`[data-testid="${TID.toast}"]`)?.remove();
  const el = h('div', { class: opts.error ? 'toast error' : 'toast', 'data-testid': TID.toast, role: 'status' }, text);
  root.append(el);
  setTimeout(() => el.remove(), opts.ms ?? 2600);
  return el;
}
