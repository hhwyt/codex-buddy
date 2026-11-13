// Dialog: title, lines, one primary + one secondary button; resolves true on confirm, false on cancel / Esc / scrim.
// Owner: Base. At most one black primary button per screen (UI-02): the dialog's confirm is that button while open.
import { h } from '../dom.js';
import { TID } from '../testids.js';

export interface DialogOptions {
  title: string;
  lines?: string[];
  confirm: string;
  /** Omit for a one-button dialog */
  cancel?: string;
  /** Extra content under the lines (e.g. a log preview) */
  body?: HTMLElement;
  root?: HTMLElement;
  /** Red confirm for destructive actions */
  danger?: boolean;
}

export function dialog(opts: DialogOptions): Promise<boolean> {
  const root = opts.root ?? document.body;
  return new Promise(resolve => {
    const close = (value: boolean) => { scrim.remove(); document.removeEventListener('keydown', onKey); resolve(value); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'data-testid': TID.dialog.root },
      h('h2', {}, opts.title),
      ...(opts.lines ?? []).map(l => h('p', {}, l)),
      opts.body ?? null,
      h('div', { class: 'row' },
        opts.cancel ? h('button', { class: 'btn', type: 'button', 'data-testid': TID.dialog.cancel, onclick: () => close(false) }, opts.cancel) : null,
        h('button', { class: opts.danger ? 'btn primary danger' : 'btn primary', type: 'button', 'data-testid': TID.dialog.confirm, onclick: () => close(true) }, opts.confirm)));
    const scrim = h('div', { class: 'scrim', onclick: (e: Event) => { if (e.target === scrim) close(false); } }, box);
    document.addEventListener('keydown', onKey);
    root.append(scrim);
  });
}
