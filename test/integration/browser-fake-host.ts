// A ViewHost for tests: "browses" the fake vendor server over HTTP with a cookie jar, runs page scripts in Node with a
// cookie-carrying fetch, and reports every response like the real DevTools capture does. Owner: A4.
import type { Bounds, Size, ViewHost } from '../../electron/main/browser';

export interface FakeHost extends ViewHost {
  bounds: Bounds | null;
  zoom: number;
  size: Size;
  screen: number;
  destroyed: boolean;
  history: string[];
  scripts: string[];
  /** The user scans the QR code on the fake login page: sets the login cookie and lands on the key page */
  userLogsIn(): Promise<void>;
  /** The user clicks「创建」on the fake key page */
  userCreatesKey(): Promise<void>;
  /** A page fetch that is not a key (e.g. the masked key list) */
  pageFetch(url: string, init?: RequestInit): Promise<void>;
  resize(width: number, height: number): void;
}

export function fakeHost(opts: { width?: number; height?: number; screen?: number } = {}): FakeHost {
  let cookie = '';
  let current = '';
  const nav: ((u: string) => void)[] = [];
  const resp: ((u: string, b: () => Promise<string>) => void)[] = [];
  const resize: (() => void)[] = [];
  const pageFetch = async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (cookie) headers.set('cookie', cookie);
    const r = await fetch(url, { ...init, headers });
    const text = await r.text();
    // Like the real capture: only requests that are not reads are reported
    if (!['GET', 'HEAD', 'OPTIONS'].includes((init.method ?? 'GET').toUpperCase())) for (const cb of resp) cb(url, async () => text);
    return new Response(text, { status: r.status });
  };
  const go = (url: string) => { current = url; host.history.push(url); for (const cb of nav) cb(url); };
  const host: FakeHost = {
    bounds: null,
    zoom: 1,
    size: { width: opts.width ?? 980, height: opts.height ?? 680 },
    screen: opts.screen ?? 1920,
    destroyed: false,
    history: [],
    scripts: [],
    async load(url) { await pageFetch(url); go(url); },
    currentUrl: () => current,
    canGoBack: () => host.history.length > 1,
    goBack: () => { host.history.pop(); current = host.history[host.history.length - 1]; for (const cb of nav) cb(current); },
    reload: () => { for (const cb of nav) cb(current); },
    async exec<T>(script: string): Promise<T> {
      host.scripts.push(script);
      return new Function('fetch', `return ${script}`)(pageFetch) as Promise<T>;
    },
    setBounds(b) { host.bounds = b; },
    setZoom(f) { host.zoom = f; },
    contentSize: () => ({ ...host.size }),
    setContentWidth(w) { host.size.width = w; },
    screenWidth: () => host.screen,
    onNavigate: cb => { nav.push(cb); },
    onResponse: cb => { resp.push(cb); },
    onResize: cb => { resize.push(cb); },
    destroy() { host.destroyed = true; },
    async userLogsIn() {
      cookie = 'fake_login=1';
      go(current.replace(/\/login.*$/, '/keys'));
    },
    async userCreatesKey() {
      const base = current.replace(/\/keys.*$/, '');
      await pageFetch(`${base}/api/keys`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"CodexBuddy"}' });
    },
    async pageFetch(url, init) { await pageFetch(url, init); },
    resize(width, height) { host.size = { width, height }; for (const cb of resize) cb(); },
  };
  return host;
}
