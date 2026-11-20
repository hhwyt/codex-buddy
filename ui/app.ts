// Page shell: models first, with a shared installation entry on every page.
import { windowApi, type BuddyApi } from './api.js';
import { mountBrowser } from './components/pip.js';
import { restartNotice } from './components/restart.js';
import { mountNetwork } from './components/network.js';
import { clearToasts } from './components/toast.js';
import { h } from './dom.js';
import { BUNDLED_QR, communityQr, renderCommunity } from './pages/community.js';
import { renderModels } from './pages/models.js';
import { renderOnboarding } from './pages/onboarding.js';
import { openSecurity } from './pages/security.js';
import { renderSettings } from './pages/settings.js';
import type { Page, Route } from './pages/types.js';
import { watchUpdates } from './pages/update.js';
import { showUpgrade } from './pages/upgrade.js';
import { TID } from './testids.js';

const PAGES: Record<Route, Page> = { models: renderModels, settings: renderSettings, community: renderCommunity };
const NAV: { route: Route; label: string; testid: string }[] = [
  { route: 'models', label: '模型', testid: TID.shell.navModels },
  { route: 'settings', label: '设置', testid: TID.shell.navSettings },
  { route: 'community', label: '社群', testid: TID.shell.navCommunity },
];

export interface App {
  go(route: Route): Promise<void>;
  route(): Route | null;
}

export async function createApp(root: HTMLElement, api: BuddyApi): Promise<App> {
  const content = h('div', { class: 'network-content' });
  root.replaceChildren(content);
  let connected: App | null = null;
  let mounting: Promise<App> | null = null;
  const network = mountNetwork(api, root, content, async () => {
    if (connected) return;
    mounting ??= createConnectedApp(content, network.api);
    try { connected = await mounting; } catch (error) { mounting = null; throw error; }
  });
  await network.start();
  return {
    async go(route) { if (network.online()) await connected?.go(route); },
    route: () => network.online() ? connected?.route() ?? null : null,
  };
}

async function createConnectedApp(root: HTMLElement, api: BuddyApi): Promise<App> {
  const state = await api.invoke('app:state');
  document.documentElement.classList.add(`os-${state.os}`);
  let current: Route | null = null;
  let cleanup: void | (() => void);
  let closeInstall: (() => void) | undefined;
  let blocked = false;

  const navButtons = NAV.map(n => h('button', {
    class: 'nav-item', type: 'button', 'data-testid': n.testid, 'data-route': n.route, onclick: () => { clearToasts(); void app.go(n.route); },
  }, n.label));
  const side = h('aside', { class: 'side', 'data-testid': TID.shell.side },
    h('div', { class: 'brand' }, h('img', { src: 'assets/icon.svg', width: 22, height: 22, alt: '' }), h('span', {}, 'CodexBuddy')),
    h('nav', {}, ...navButtons));
  const page = h('section', { class: 'page', 'data-testid': TID.shell.main });
  const top = h('header', { class: 'top' },
    h('button', { class: 'icon-btn', type: 'button', title: '安全', 'aria-label': '安全', 'data-testid': TID.shell.security, onclick: () => openSecurity(api, root) }, '🛡'),
    h('button', { class: 'icon-btn', type: 'button', title: '右侧浏览器', 'aria-label': '右侧浏览器', 'data-testid': TID.shell.browser, onclick: () => api.invoke('browser:show', { mode: 'expanded' }) }, '🌐'));
  const banner = h('button', { class: 'install-banner', type: 'button', 'data-testid': TID.onboarding.start, onclick: () => openInstall() },
    h('span', { class: 'install-icon', 'aria-hidden': 'true' }, 'ⓘ'),
    h('span', { class: 'install-text' }, '这台电脑还没装 Codex'), h('span', { class: 'install-action' }, '去安装 →'));
  banner.hidden = state.codexInstalled;
  const shell = h('div', { class: 'shell' }, side, h('main', { class: 'main' }, top, banner, restartNotice(api, !!state.restartRequired), page));
  root.replaceChildren(shell);

  function openInstall(): void {
    if (blocked || closeInstall || banner.hidden) return;
    void api.invoke('browser:close');
    const host = h('div');
    root.append(host);
    shell.inert = true;
    const dispose = renderOnboarding({ api, root: host, go: route => {
      closeInstall?.();
      void app.go(route);
    } });
    closeInstall = () => {
      dispose();
      host.remove();
      shell.inert = false;
      closeInstall = undefined;
      banner.focus();
    };
  }

  const app: App = {
    async go(route) {
      if (blocked) return;
      const fresh = await api.invoke('app:state');
      if (blocked) return;
      banner.hidden = fresh.codexInstalled;
      if (typeof cleanup === 'function') cleanup();
      current = route;
      for (const b of navButtons) {
        if (b.dataset.route === route) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      }
      cleanup = await PAGES[route]({ api, root: page, go: r => { void app.go(r); } });
    },
    route: () => current,
  };
  // Forced upgrade (remote minVersion): this one screen replaces everything, now or whenever a refresh raises the floor
  const block = (u: typeof state.upgradeRequired) => {
    if (!u) return;
    closeInstall?.();
    if (!blocked && typeof cleanup === 'function') cleanup();
    blocked = true;
    current = null;
    clearToasts();
    void api.invoke('browser:close');
    showUpgrade(api, root, u, { os: state.os, current: state.version, qr: communityQr(state.community.qrUrl) ?? BUNDLED_QR });
  };
  api.on('upgradeRequired', block);
  watchUpdates(api, root);
  mountBrowser(api, root);
  if (state.upgradeRequired) block(state.upgradeRequired);
  else await app.go('models');
  return app;
}

if (typeof window !== 'undefined' && window.buddy) {
  void createApp(document.getElementById('app')!, windowApi());
}
