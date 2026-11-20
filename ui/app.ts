// Page shell and router. Owner: Base.
// Layout: left column with three items (模型 / 设置 / 社群), top right 🛡 (security panel) and 🌐 (right-side
// browser). Onboarding is full width without the left column. First screen: model page when already configured
// (O-06), else onboarding. Switching pages never touches the right-side browser (B-04).
import { windowApi, type BuddyApi } from './api.js';
import { mountBrowser } from './components/pip.js';
import { clearToasts } from './components/toast.js';
import { h } from './dom.js';
import { renderCommunity } from './pages/community.js';
import { renderModels } from './pages/models.js';
import { renderOnboarding } from './pages/onboarding.js';
import { openSecurity } from './pages/security.js';
import { renderSettings } from './pages/settings.js';
import type { Page, Route } from './pages/types.js';
import { watchUpdates } from './pages/update.js';
import { showUpgrade } from './pages/upgrade.js';
import { TID } from './testids.js';

const PAGES: Record<Route, Page> = { onboarding: renderOnboarding, models: renderModels, settings: renderSettings, community: renderCommunity };
const NAV: { route: Exclude<Route, 'onboarding'>; label: string; testid: string }[] = [
  { route: 'models', label: '模型', testid: TID.shell.navModels },
  { route: 'settings', label: '设置', testid: TID.shell.navSettings },
  { route: 'community', label: '社群', testid: TID.shell.navCommunity },
];

export interface App {
  go(route: Route): Promise<void>;
  route(): Route | null;
}

export async function createApp(root: HTMLElement, api: BuddyApi): Promise<App> {
  const state = await api.invoke('app:state');
  document.documentElement.classList.add(`os-${state.os}`);
  let current: Route | null = null;
  let cleanup: void | (() => void);

  const navButtons = NAV.map(n => h('button', {
    class: 'nav-item', type: 'button', 'data-testid': n.testid, 'data-route': n.route, onclick: () => { clearToasts(); void app.go(n.route); },
  }, n.label));
  const side = h('aside', { class: 'side', 'data-testid': TID.shell.side }, h('nav', {}, ...navButtons));
  const page = h('section', { class: 'page', 'data-testid': TID.shell.main });
  const top = h('header', { class: 'top' },
    h('button', { class: 'icon-btn', type: 'button', title: '安全', 'aria-label': '安全', 'data-testid': TID.shell.security, onclick: () => openSecurity(api, root) }, '🛡'),
    h('button', { class: 'icon-btn', type: 'button', title: '右侧浏览器', 'aria-label': '右侧浏览器', 'data-testid': TID.shell.browser, onclick: () => api.invoke('browser:show', { mode: 'expanded' }) }, '🌐'));
  const shell = h('div', { class: 'shell' }, side, h('main', { class: 'main' }, top, page));
  root.replaceChildren(shell);

  let blocked = false;
  let versionStatus = state.versionStatus;
  let required = state.upgradeRequired;
  let gate: HTMLElement | null = null;
  let gateKey = '';
  const app: App = {
    async go(route) {
      if (blocked) return;
      if (typeof cleanup === 'function') cleanup();
      current = route;
      shell.classList.toggle('bare', route === 'onboarding');
      for (const b of navButtons) {
        if (b.dataset.route === route) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      }
      cleanup = await PAGES[route]({ api, root: page, go: r => { void app.go(r); } });
    },
    route: () => current,
  };
  const synchronizeGate = () => {
    const key = required ? `required:${required.version}` : versionStatus && versionStatus !== 'allowed' ? versionStatus : '';
    blocked = !!key;
    shell.inert = blocked;
    if (key === gateKey) return;
    gateKey = key;
    gate?.dispatchEvent(new Event('dispose'));
    gate?.remove();
    gate = null;
    if (blocked) {
      clearToasts();
      void api.invoke('browser:close');
      gate = showUpgrade(api, root, required, { os: state.os, current: state.version, qr: '', status: versionStatus });
    } else if (!current) void app.go(state.configured ? 'models' : 'onboarding');
  };
  api.on('upgradeRequired', info => { required = info; synchronizeGate(); });
  api.on('versionStatus', status => { versionStatus = status; synchronizeGate(); });
  watchUpdates(api, root);
  mountBrowser(api, root);
  synchronizeGate();
  if (!blocked && !current) await app.go(state.configured ? 'models' : 'onboarding');
  return app;
}

if (typeof window !== 'undefined' && window.buddy) {
  void createApp(document.getElementById('app')!, windowApi());
}
