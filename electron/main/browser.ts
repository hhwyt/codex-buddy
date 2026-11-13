// The right-side browser (PRD §3.6) with picture-in-picture. Owner: A4.
// B-01 PiP bottom right while automating; B-02 expanded for scan / pay: the window widens ~480px (as much as the screen
// has room for, at least 400px; it slides left if its right edge would leave the screen), or covers the right half
// when the screen is too narrow; B-03 click PiP or 🌐 → expand, can shrink back; B-04 only ✕ closes, page
// switches leave it alone; B-05 read-only address bar, back and reload; B-06 closed at start; B-07 own session
// partition (persist:codexbuddy-browser), never the user's Chrome. Every request host is logged as「网页里连过的」
// (main/net.ts). The page draws the chrome (address bar, ✕, PiP bar); this file only places the web view under it.
import { BrowserWindow, WebContentsView, screen } from 'electron';
import type { BrowserDriver } from '../vendors/types';

export const BROWSER_PARTITION = 'persist:codexbuddy-browser';
export const EXPANDED_EXTRA_WIDTH = 480;
/** Less room than this on the screen and the expanded browser covers the right half instead of widening */
export const MIN_WIDEN = 400;
/** Height of the address bar the page draws above the expanded view */
export const CHROME_BAR_HEIGHT = 53;
/** PiP box drawn by the page (ui/pip.css): 320×210, 16px from the bottom right, 30px title bar + 1px line.
 *  The view sits inside the 1px border */
export const PIP = { width: 318, height: 208, margin: 17, bar: 31 };

export type BrowserMode = 'pip' | 'expanded';
export interface Bounds { x: number; y: number; width: number; height: number }
export interface Size { width: number; height: number }
export interface BrowserState { open: boolean; mode: BrowserMode; url: string; canGoBack: boolean }

/** Where the web view sits inside the window's content area */
export function viewBounds(mode: BrowserMode, content: Size, widened: boolean): Bounds {
  if (mode === 'pip') {
    return {
      x: content.width - PIP.margin - PIP.width, y: content.height - PIP.margin - PIP.height + PIP.bar,
      width: PIP.width, height: PIP.height - PIP.bar,
    };
  }
  const width = widened ? EXPANDED_EXTRA_WIDTH : content.width - Math.floor(content.width / 2);
  return { x: content.width - width, y: CHROME_BAR_HEIGHT, width, height: content.height - CHROME_BAR_HEIGHT };
}

/** How much the window grows for the expanded browser: ~480px, less on a screen just short of that (a 1440px-wide
 *  screen fits 980 + 460), 0 when under MIN_WIDEN is left. A widened view stays 480px, the last few px over the page */
export function widenBy(contentWidth: number, screenWidth: number): number {
  const room = Math.min(EXPANDED_EXTRA_WIDTH, screenWidth - contentWidth);
  return room >= MIN_WIDEN ? room : 0;
}

/** x for a window that grew past the screen's right edge: slide it left, never past the left edge. null = leave it.
 *  A window that was off screen (test runs park it at -30000) stays where it is */
export function keepOnScreen(before: Bounds, after: Bounds, area: Bounds): number | null {
  const right = area.x + area.width;
  if (before.x < area.x || before.x >= right || after.x + after.width <= right) return null;
  return Math.max(area.x, right - after.width);
}

/** The Electron side of the browser, kept thin so the controller is testable without Electron */
export interface ViewHost {
  load(url: string): Promise<void>;
  currentUrl(): string;
  canGoBack(): boolean;
  goBack(): void;
  reload(): void;
  exec<T>(script: string): Promise<T>;
  setBounds(b: Bounds): void;
  contentSize(): Size;
  setContentWidth(width: number): void;
  screenWidth(): number;
  onNavigate(cb: (url: string) => void): void;
  /** Every finished response; body() reads it lazily (only for the ones a vendor flow waits for) */
  onResponse(cb: (url: string, body: () => Promise<string>) => void): void;
  onResize(cb: () => void): void;
  destroy(): void;
}

export class BrowserClosed extends Error {
  constructor() { super('右侧浏览器被关掉了'); this.name = 'BrowserClosed'; }
}

export interface RightBrowser extends BrowserDriver {
  /** ✕ (B-04): the only way it closes; pending waits resolve as cancelled (M-09) */
  close(): void;
  back(): void;
  reload(): void;
  /** 🌐 / PiP click / shrink (B-03); opens a blank browser when closed */
  show(mode: BrowserMode): void;
  state(): BrowserState;
}

interface UrlWaiter { pred: (url: string) => boolean; done: (v: boolean) => void }
interface RespWaiter { match: RegExp; resolve: (body: string) => void; reject: (e: Error) => void }

export function createRightBrowser(makeHost: () => ViewHost, onState: (s: BrowserState) => void = () => {}): RightBrowser {
  let host: ViewHost | null = null;
  let mode: BrowserMode = 'pip';
  /** px the window grew for the expanded browser; 0 = not widened */
  let widenedBy = 0;
  const urlWaiters = new Set<UrlWaiter>();
  const respWaiters = new Set<RespWaiter>();

  const state = (): BrowserState => ({
    open: !!host, mode, url: host?.currentUrl() ?? '', canGoBack: host?.canGoBack() ?? false,
  });
  const emit = () => onState(state());
  const place = () => { if (host) host.setBounds(viewBounds(mode, host.contentSize(), widenedBy > 0)); };

  const checkUrl = (url: string) => {
    for (const w of [...urlWaiters]) if (w.pred(url)) { urlWaiters.delete(w); w.done(true); }
  };

  function ensureHost(): ViewHost {
    if (host) return host;
    const h = makeHost();
    host = h;
    h.onNavigate(url => { checkUrl(url); emit(); });
    h.onResponse((url, body) => {
      for (const w of [...respWaiters]) {
        if (!w.match.test(url)) continue;
        respWaiters.delete(w);
        body().then(w.resolve, w.reject);
      }
    });
    h.onResize(place);
    return h;
  }

  function applyMode(m: BrowserMode) {
    const h = ensureHost();
    mode = m;
    const { width } = h.contentSize();
    if (m === 'expanded' && !widenedBy) {
      widenedBy = widenBy(width, h.screenWidth());
      if (widenedBy) h.setContentWidth(width + widenedBy);
    } else if (m === 'pip' && widenedBy) {
      h.setContentWidth(width - widenedBy);
      widenedBy = 0;
    }
    place();
    emit();
  }

  return {
    async open(url, opts) {
      const h = ensureHost();
      applyMode(opts.mode);
      // A redirect aborts the first load (ERR_ABORTED); the navigation events still tell us where we landed
      await h.load(url).catch(() => undefined);
      emit();
    },
    url: () => host?.currentUrl() ?? '',
    async evaluate<T>(script: string): Promise<T> {
      if (!host) throw new BrowserClosed();
      return host.exec<T>(script);
    },
    waitForResponse(match, timeoutMs) {
      if (!host) return Promise.reject(new BrowserClosed());
      return new Promise<string>((resolve, reject) => {
        const w: RespWaiter = {
          match,
          resolve: b => { clearTimeout(t); resolve(b); },
          reject: e => { clearTimeout(t); reject(e); },
        };
        const t = setTimeout(() => { respWaiters.delete(w); reject(new Error('timeout')); }, timeoutMs);
        respWaiters.add(w);
      });
    },
    async waitForUrl(pred, timeoutMs) {
      if (!host) return false;
      if (pred(host.currentUrl())) return true;
      return new Promise<boolean>(resolve => {
        const w: UrlWaiter = { pred, done: v => { clearTimeout(t); resolve(v); } };
        const t = setTimeout(() => { urlWaiters.delete(w); resolve(false); }, timeoutMs);
        urlWaiters.add(w);
      });
    },
    setMode(m) { if (host) applyMode(m); },
    show(m) { applyMode(m); },
    back() { if (host?.canGoBack()) host.goBack(); },
    reload() { host?.reload(); },
    state,
    close() {
      if (!host) return;
      const h = host;
      if (widenedBy) h.setContentWidth(h.contentSize().width - widenedBy);
      widenedBy = 0;
      mode = 'pip';
      host = null;
      h.destroy();
      for (const w of urlWaiters) w.done(false);
      urlWaiters.clear();
      for (const w of respWaiters) w.reject(new BrowserClosed());
      respWaiters.clear();
      emit();
    },
  };
}

/** The real view: a WebContentsView on its own partition (B-07), responses read through the DevTools protocol */
export function electronViewHost(win: BrowserWindow): ViewHost {
  const view = new WebContentsView({
    webPreferences: { partition: BROWSER_PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.contentView.addChildView(view);
  const wc = view.webContents;
  // Official pages that open a popup (OAuth, QR) stay in the same view
  wc.setWindowOpenHandler(({ url }) => { void wc.loadURL(url).catch(() => undefined); return { action: 'deny' }; });
  const navCbs: ((url: string) => void)[] = [];
  const respCbs: ((url: string, body: () => Promise<string>) => void)[] = [];
  const resizeCbs: (() => void)[] = [];
  const fireNav = () => { for (const cb of navCbs) cb(wc.getURL()); };
  wc.on('did-navigate', fireNav);
  wc.on('did-navigate-in-page', fireNav);
  const onResize = () => { for (const cb of resizeCbs) cb(); };
  win.on('resize', onResize);

  /** x the window had before it slid left to widen on screen; put back when it narrows again */
  let slidFrom: number | null = null;
  const urls = new Map<string, string>();
  try {
    wc.debugger.attach('1.3');
    void wc.debugger.sendCommand('Network.enable').catch(() => undefined);
  } catch {
    // Already attached (DevTools open): level-2 capture is skipped, the ladder falls back to paste
  }
  wc.debugger.on('message', (_e, method, params: { requestId: string; response?: { url: string } }) => {
    if (method === 'Network.responseReceived' && params.response) urls.set(params.requestId, params.response.url);
    else if (method === 'Network.loadingFinished') {
      const url = urls.get(params.requestId);
      if (!url) return;
      urls.delete(params.requestId);
      const body = async () => {
        const r = await wc.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId }) as { body: string; base64Encoded: boolean };
        return r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body;
      };
      for (const cb of respCbs) cb(url, body);
    }
  });

  return {
    load: url => wc.loadURL(url),
    currentUrl: () => wc.getURL(),
    canGoBack: () => wc.navigationHistory.canGoBack(),
    goBack: () => wc.navigationHistory.goBack(),
    reload: () => wc.reload(),
    exec: <T>(script: string) => wc.executeJavaScript(script, true) as Promise<T>,
    setBounds: b => view.setBounds(b),
    contentSize: () => { const [width, height] = win.getContentSize(); return { width, height }; },
    setContentWidth: width => {
      const [oldWidth, height] = win.getContentSize();
      const before = win.getBounds();
      win.setContentSize(width, height);
      const after = win.getBounds();
      if (width < oldWidth) {
        if (slidFrom !== null) win.setPosition(slidFrom, after.y);
        slidFrom = null;
        return;
      }
      const x = keepOnScreen(before, after, screen.getDisplayMatching(before).workArea);
      if (x !== null) { slidFrom = before.x; win.setPosition(x, after.y); }
    },
    screenWidth: () => screen.getDisplayMatching(win.getBounds()).workArea.width,
    onNavigate: cb => { navCbs.push(cb); },
    onResponse: cb => { respCbs.push(cb); },
    onResize: cb => { resizeCbs.push(cb); },
    destroy: () => {
      win.off('resize', onResize);
      try { wc.debugger.detach(); } catch { /* not attached */ }
      if (!win.isDestroyed()) win.contentView.removeChildView(view);
      wc.close();
    },
  };
}

/** 「一次性打开登录页」: one small window per URL, all on the browser partition, so one login serves the app */
export function openLoginWindows(urls: string[]): BrowserWindow[] {
  return urls.map((url, i) => {
    const w = new BrowserWindow({
      width: 480, height: 720, x: 40 + i * 30, y: 40 + i * 30, title: 'CodexBuddy 登录',
      webPreferences: { partition: BROWSER_PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    void w.loadURL(url).catch(() => undefined);
    return w;
  });
}

/** IPC handlers for the page's browser chrome (B-03, B-04, B-05) */
export function browserHandlers(rb: RightBrowser) {
  return {
    'browser:show': ({ mode }: { mode: BrowserMode }) => rb.show(mode),
    'browser:close': () => rb.close(),
    'browser:back': () => rb.back(),
    'browser:reload': () => rb.reload(),
  };
}
