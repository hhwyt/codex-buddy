import { NETWORK_READ_CHANNELS, type ArgsOf, type Channel, type ResultOf } from '../../electron/main/ipc-contract.js';
import type { BuddyApi } from '../api.js';
import { h } from '../dom.js';
import { showCommunityOverlay } from '../pages/community.js';
import { TID } from '../testids.js';

const READ_ONLY = new Set<Channel>(NETWORK_READ_CHANNELS);
const ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 23a6 6 0 0 1-1-11 9 9 0 0 1 17-2 7 7 0 0 1 3 13"/><path d="m12 18 8 8m0-8-8 8"/></svg>';

export function mountNetwork(
  raw: BuddyApi, root: HTMLElement, content: HTMLElement, ready: () => Promise<void>,
): { api: BuddyApi; start(): Promise<void>; online(): boolean } {
  let available = false;
  let checking = false;
  let generation = 0;
  let waiting: (() => void)[] = [];
  let community: ReturnType<typeof showCommunityOverlay> | null = null;
  const body = h('div', { class: 'network-body' });
  const screen = h('div', { class: 'network-screen', 'data-testid': TID.network.root },
    h('header', { class: 'network-brand' }, h('img', { src: 'assets/icon.svg', alt: '', width: 27, height: 27 }), 'CodexBuddy'), body);
  root.append(screen);

  function openCommunity(): void {
    community?.close();
    community = showCommunityOverlay(api, root, { offline: true }, () => {
      community = null;
      screen.querySelector<HTMLButtonElement>(`[data-testid="${TID.network.community}"]`)?.focus();
    });
  }

  function lock(): void {
    checking = false;
    available = false;
    generation++;
    community?.close();
    community = null;
    content.inert = true;
    content.hidden = true;
    content.style.visibility = 'hidden';
    screen.hidden = false;
    const icon = h('div', { class: 'network-error-icon' });
    icon.innerHTML = ICON;
    const quit = h('button', { class: 'btn', type: 'button', 'data-testid': TID.network.quit, onclick: () => void raw.invoke('app:quit') }, '退出');
    const communityBtn = h('button', { class: 'btn', type: 'button', 'data-testid': TID.network.community, onclick: () => openCommunity() }, '去社群问问');
    const retry = h('button', { class: 'btn primary', type: 'button', 'data-testid': TID.network.retry, onclick: () => void connect() }, '重试');
    body.replaceChildren(h('img', { class: 'network-logo', src: 'assets/icon.svg', alt: '' }),
      h('div', { class: 'network-scrim' }, h('div', { class: 'dialog network-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'network-title', 'data-testid': TID.network.error },
        icon, h('h2', { id: 'network-title' }, '网络问题'), h('p', {}, '请检查网络后重试。'), h('div', { class: 'row' }, quit, communityBtn, retry))));
    quit.focus();
  }

  async function connect(): Promise<void> {
    if (checking) return;
    checking = true;
    available = false;
    const ticket = ++generation;
    screen.hidden = false;
    content.inert = true;
    content.hidden = true;
    content.style.visibility = 'hidden';
    const loading = h('div', { class: 'network-loading', role: 'status', tabindex: '-1', 'data-testid': TID.network.loading },
      h('div', { class: 'network-spinner', 'aria-hidden': 'true' }), h('h2', {}, '正在连接'), h('p', {}, '连接成功后即可使用'));
    body.replaceChildren(loading);
    loading.focus();
    let ok = false;
    try { ok = (await raw.invoke('network:check')).ok === true; } catch { /* one user-facing failure */ }
    checking = false;
    if (ticket !== generation) return;
    if (!ok) { lock(); return; }
    available = true;
    // Keep the app covered and inert while allowing its responsive layout to measure the real window.
    content.hidden = false;
    const resumed = waiting;
    waiting = [];
    resumed.forEach(resolve => resolve());
    try {
      await ready();
      if (ticket !== generation || !available) return;
      screen.hidden = true;
      content.inert = false;
      content.hidden = false;
      content.style.visibility = '';
      community?.close();
      community = null;
      window.dispatchEvent(new Event('resize'));
    } catch { lock(); }
  }

  const api: BuddyApi = {
    async invoke<C extends Channel>(channel: C, ...args: ArgsOf<C> extends void ? [] : [ArgsOf<C>]): Promise<ResultOf<C>> {
      const result = await raw.invoke(channel, ...args);
      if (result && typeof result === 'object' && 'kind' in result && result.kind === 'network') {
        lock();
        // Only harmless reads resume after an explicit retry. Never replay a configuration change or an install.
        if (READ_ONLY.has(channel)) {
          await new Promise<void>(resolve => waiting.push(resolve));
          return api.invoke(channel, ...args);
        }
      }
      return result;
    },
    on: (event, listener) => raw.on(event, listener),
  };
  raw.on('network', state => { if (screen.isConnected && state === 'offline') lock(); });
  window.addEventListener('offline', () => {
    if (!screen.isConnected) return;
    lock();
    void raw.invoke('network:offline');
  });
  document.addEventListener('keydown', event => {
    if (available || !screen.isConnected) return;
    if (community) return; // the lock overlay owns the keyboard while it is open
    if (event.key === 'Escape' || !screen.contains(event.target as Node)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
    if (event.key === 'Tab') {
      event.preventDefault(); event.stopImmediatePropagation();
      const buttons = [...screen.querySelectorAll<HTMLButtonElement>('button')];
      if (buttons.length) buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + 1) % buttons.length].focus();
    }
  }, true);
  return { api, start: connect, online: () => available };
}
