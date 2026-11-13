// Page shell and router. Owner: Base.
// Layout: left column with three items (模型 / 设置 / 帮助), top right 🛡 (security panel) and 🌐 (right-side
// browser). Onboarding is full width without the left column. First screen: model page when already configured
// (O-06), else onboarding. Switching pages never touches the right-side browser (B-04).
import { windowApi, type BuddyApi } from './api.js';
import { h } from './dom.js';
import { renderHelp } from './pages/help.js';
import { renderModels } from './pages/models.js';
import { renderOnboarding } from './pages/onboarding.js';
import { openSecurity } from './pages/security.js';
import { renderSettings } from './pages/settings.js';
import type { Page, Route } from './pages/types.js';
import { watchUpdates } from './pages/update.js';
import { TID } from './testids.js';

const PAGES: Record<Route, Page> = { onboarding: renderOnboarding, models: renderModels, settings: renderSettings, help: renderHelp };
const NAV: { route: Exclude<Route, 'onboarding'>; label: string; testid: string }[] = [
  { route: 'models', label: '模型', testid: TID.shell.navModels },
  { route: 'settings', label: '设置', testid: TID.shell.navSettings },
  { route: 'help', label: '帮助', testid: TID.shell.navHelp },
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
    class: 'nav-item', type: 'button', 'data-testid': n.testid, 'data-route': n.route, onclick: () => app.go(n.route),
  }, n.label));
  const side = h('aside', { class: 'side', 'data-testid': TID.shell.side }, h('nav', {}, ...navButtons));
  const page = h('section', { class: 'page', 'data-testid': TID.shell.main });
  const top = h('header', { class: 'top' },
    h('button', { class: 'icon-btn', type: 'button', title: '安全', 'aria-label': '安全', 'data-testid': TID.shell.security, onclick: () => openSecurity(api, root) }, '🛡'),
    h('button', { class: 'icon-btn', type: 'button', title: '右侧浏览器', 'aria-label': '右侧浏览器', 'data-testid': TID.shell.browser, onclick: () => api.invoke('browser:show', { mode: 'expanded' }) }, '🌐'));
  const shell = h('div', { class: 'shell' }, side, h('main', { class: 'main' }, top, page));
  root.replaceChildren(shell);

  const app: App = {
    async go(route) {
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
  watchUpdates(api, root);
  await app.go(state.configured ? 'models' : 'onboarding');
  return app;
}

if (typeof window !== 'undefined' && window.buddy) {
  void createApp(document.getElementById('app')!, windowApi());
}
