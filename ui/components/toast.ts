// Toast: one line at the bottom, gone after a few seconds. Error toasts are a white card with a red ✕ and 去社群咨询.
// Owner: Base.
import { h } from '../dom.js';
import { TID } from '../testids.js';
import { helpLink } from './help.js';

export function toast(text: string, opts: { error?: boolean; ms?: number; help?: boolean; root?: HTMLElement } = {}): HTMLElement {
  const root = opts.root ?? document.body;
  root.querySelector(`[data-testid="${TID.toast}"]`)?.remove();
  const showHelp = opts.help ?? opts.error === true;
  const children: (Node | string)[] = [];
  if (opts.error) {
    children.push(h('span', { class: 'toast-x', 'aria-hidden': 'true' }, '✕'));
    children.push(h('span', { class: 'msg' }, text));
    if (showHelp) children.push(helpLink());
  } else {
    children.push(text);
  }
  const el = h('div', { class: opts.error ? 'toast error' : 'toast', 'data-testid': TID.toast, role: 'status' }, ...children);
  root.append(el);
  setTimeout(() => el.remove(), opts.ms ?? (opts.error ? 8000 : 2600));
  return el;
}

/** Clears every toast: a message from one page must not linger on the next (W-02) */
export function clearToasts(): void {
  for (const el of document.querySelectorAll(`[data-testid="${TID.toast}"]`)) el.remove();
}
