// Right-side browser chrome drawn by the page (PRD §3.6). Owner: A11.
// The web page itself is drawn by the main process; the page draws the frame around it:
//   画中画：右下角小窗，角上小点在闪，点一下放大 B-01, B-03；✕ 关 B-04
//   右侧面板：后退、刷新、只读地址栏 B-05，「缩小」缩回画中画 B-03，✕ 关 B-04
// State comes only from the main process `browser` event; nothing is remembered between launches (B-06).
// Mount once on the shell (not on a page), so switching pages leaves it alone (B-04).
import type { BuddyApi, IpcEvents } from '../../electron/main/ipc-contract.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';

export type BrowserState = IpcEvents['browser'];

export function mountBrowser(api: BuddyApi, root: HTMLElement): () => void {
  const host = h('div', { class: 'browser-host' });
  root.append(host);

  const btn = (testid: string, label: string, text: string, onclick: () => void, disabled = false) =>
    h('button', { class: 'browser-btn', type: 'button', title: label, 'aria-label': label, 'data-testid': testid, disabled, onclick }, text);
  const close = () => btn(TID.browser.close, '关闭', '✕', () => void api.invoke('browser:close'));

  function render(s: BrowserState): void {
    // While the small window sits bottom right, pages leave room under their content so nothing stays hidden behind it
    root.classList.toggle('pip-open', s.open && s.mode === 'pip');
    // The expanded browser's width (from the main process): its frame matches the native view, pages move out of its way
    root.classList.toggle('browser-expanded', s.open && s.mode === 'expanded');
    root.style.setProperty('--browser-width', `${s.width}px`);
    if (!s.open) { host.replaceChildren(); return; }
    if (s.mode === 'pip') {
      const expand = () => void api.invoke('browser:show', { mode: 'expanded' });
      host.replaceChildren(h('div', { class: 'pip', 'data-testid': TID.browser.pip, title: '点一下放大', onclick: expand },
        h('div', { class: 'pip-bar' },
          h('span', { class: 'pip-live', 'aria-hidden': 'true' }),
          h('span', { class: 'pip-url' }, hostOf(s.url)),
          stop(btn(TID.browser.expand, '放大', '⤢', expand)),
          stop(close())),
        h('div', { class: 'pip-view' })));
      return;
    }
    host.replaceChildren(h('div', { class: 'browser-panel' },
      h('div', { class: 'browser-panel-bar' },
        btn(TID.browser.back, '后退', '‹', () => void api.invoke('browser:back'), !s.canGoBack),
        btn(TID.browser.reload, '刷新', '↻', () => void api.invoke('browser:reload')),
        h('input', { class: 'browser-panel-address', 'data-testid': TID.browser.address, readonly: true, value: s.url, 'aria-label': '地址' }),
        btn(TID.browser.shrink, '缩小', '⤡', () => void api.invoke('browser:show', { mode: 'pip' })),
        close()),
      h('div', { class: 'browser-panel-view' })));
  }

  const off = api.on('browser', render);
  return () => { off(); host.remove(); };
}

/** Buttons inside the clickable picture-in-picture run once, and ✕ does not also expand */
function stop(el: HTMLElement): HTMLElement {
  el.addEventListener('click', e => e.stopPropagation());
  return el;
}

function hostOf(url: string): string {
  try { return new URL(url).host || url; } catch { return url; }
}
