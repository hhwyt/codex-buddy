// The check made each time CodexBuddy opens (N-01..N-04, design/network-entry.html). The usual page shows at once; the
// check runs behind it. Only when it fails does the 「网络问题」 dialog cover the page, which stays unusable until a check
// passes (automatically every few seconds, or 「重试」). Losing the network later in the session shows nothing here.
import { type ArgsOf, type Channel, type ResultOf } from '../../electron/main/ipc-contract.js';
import type { BuddyApi } from '../api.js';
import { h } from '../dom.js';
import { showCommunityOverlay } from '../pages/community.js';
import { TID } from '../testids.js';

/** While the dialog is up, check again this often (N-04) */
export const NETWORK_RETRY_MS = 3000;
const ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 23a6 6 0 0 1-1-11 9 9 0 0 1 17-2 7 7 0 0 1 3 13"/><path d="m12 18 8 8m0-8-8 8"/></svg>';

export function mountNetwork(
  raw: BuddyApi, root: HTMLElement, content: HTMLElement, ready: () => Promise<void>,
): { api: BuddyApi; start(): Promise<void>; online(): boolean } {
  let locked = false;
  let checking: Promise<boolean> | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let community: ReturnType<typeof showCommunityOverlay> | null = null;
  const screen = h('div', { class: 'network-screen', 'data-testid': TID.network.root });
  screen.hidden = true;
  root.append(screen);

  function openCommunity(): void {
    community?.close();
    community = showCommunityOverlay(api, root, { offline: true }, () => {
      community = null;
      screen.querySelector<HTMLButtonElement>(`[data-testid="${TID.network.community}"]`)?.focus();
    });
  }

  function check(): Promise<boolean> {
    checking ??= raw.invoke('network:check').then(r => r.ok === true, () => false).then(ok => {
      checking = null;
      if (ok) unlock(); else lock();
      return ok;
    });
    return checking;
  }

  function unlock(): void {
    if (!locked) return;
    locked = false;
    clearInterval(timer);
    community?.close();
    community = null;
    screen.hidden = true;
    screen.replaceChildren();
    content.inert = false;
  }

  function lock(): void {
    const retry = screen.querySelector<HTMLButtonElement>(`[data-testid="${TID.network.retry}"]`);
    if (locked) { if (retry) { retry.disabled = false; retry.replaceChildren('重试'); } return; }
    locked = true;
    content.inert = true;
    screen.hidden = false;
    const icon = h('div', { class: 'network-error-icon' });
    icon.innerHTML = ICON;
    const quit = h('button', { class: 'btn', type: 'button', 'data-testid': TID.network.quit, onclick: () => void raw.invoke('app:quit') }, '退出');
    const communityBtn = h('button', { class: 'btn', type: 'button', 'data-testid': TID.network.community, onclick: () => openCommunity() }, '去社群问问');
    const again: HTMLButtonElement = h('button', { class: 'btn primary', type: 'button', 'data-testid': TID.network.retry, onclick: () => {
      again.disabled = true;
      again.replaceChildren(h('span', { class: 'network-retry-spin', 'aria-hidden': 'true' }), '重试');
      void check();
    } }, '重试');
    screen.replaceChildren(h('div', { class: 'network-scrim' }, h('div', { class: 'dialog network-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'network-title', 'data-testid': TID.network.error },
      icon, h('h2', { id: 'network-title' }, '网络问题'), h('p', {}, '请检查网络后重试。'), h('div', { class: 'row' }, quit, communityBtn, again))));
    quit.focus();
    clearInterval(timer);
    timer = setInterval(() => { if (!checking) void check(); }, NETWORK_RETRY_MS);
  }

  const api: BuddyApi = {
    async invoke<C extends Channel>(channel: C, ...args: ArgsOf<C> extends void ? [] : [ArgsOf<C>]): Promise<ResultOf<C>> {
      const result = await raw.invoke(channel, ...args);
      // An action refused because the opening check failed: the dialog is (or now goes) up
      if (result && typeof result === 'object' && 'kind' in result && result.kind === 'network') lock();
      return result;
    },
    on: (event, listener) => raw.on(event, listener),
  };
  document.addEventListener('keydown', event => {
    if (!locked || !screen.isConnected || community) return;
    if (event.key === 'Escape' || !screen.contains(event.target as Node)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
    if (event.key === 'Tab') {
      event.preventDefault(); event.stopImmediatePropagation();
      const buttons = [...screen.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (buttons.length) buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + 1) % buttons.length].focus();
    }
  }, true);
  return {
    api,
    start: async () => { await Promise.all([ready().catch(() => { lock(); }), check()]); },
    online: () => !locked,
  };
}
