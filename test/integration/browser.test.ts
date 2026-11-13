// L2: the right-side browser — PiP / expanded layout, window widening, close = cancel, own partition. The controller
// runs against a fake view host; the Electron view host runs against a mocked electron module. Owner: A4.
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const fx = vi.hoisted(() => ({ views: [] as any[], windows: [] as any[], screenWidth: 1920, attachThrows: false }));

vi.mock('electron', async () => {
  const { EventEmitter: EE } = await import('node:events');
  class FakeWebContents extends EE {
    url = '';
    closed = false;
    openHandler: ((d: { url: string }) => unknown) | null = null;
    history = { back: 0, canGoBack: () => true, goBack: () => { this.history.back++; } };
    navigationHistory = { canGoBack: () => this.history.canGoBack(), goBack: () => this.history.goBack() };
    reloads = 0;
    debugger = Object.assign(new EE(), {
      attached: false,
      attach: () => { if (fx.attachThrows) throw new Error('already attached'); (this.debugger as any).attached = true; },
      detach: () => { if (!(this.debugger as any).attached) throw new Error('not attached'); (this.debugger as any).attached = false; },
      sendCommand: async (method: string, params?: { requestId: string }) => {
        if (method === 'Network.getResponseBody') {
          return params!.requestId === 'b64' ? { body: Buffer.from('{"key":"sk-base64base64base64"}').toString('base64'), base64Encoded: true } : { body: `body-${params!.requestId}`, base64Encoded: false };
        }
        return {};
      },
    });
    setWindowOpenHandler(h: (d: { url: string }) => unknown) { this.openHandler = h; }
    async loadURL(u: string) { if (u.includes('fail')) throw new Error('ERR_ABORTED'); this.url = u; this.emit('did-navigate', {}, u); }
    getURL() { return this.url; }
    reload() { this.reloads++; }
    async executeJavaScript(s: string) { return `ran:${s}`; }
    close() { this.closed = true; }
  }
  class WebContentsView {
    webContents = new FakeWebContents();
    bounds: unknown = null;
    constructor(public opts: unknown) { fx.views.push(this); }
    setBounds(b: unknown) { this.bounds = b; }
  }
  class BrowserWindow extends EE {
    size = [980, 680];
    destroyed = false;
    children: unknown[] = [];
    webContents = new FakeWebContents();
    contentView = {
      addChildView: (v: unknown) => { this.children.push(v); },
      removeChildView: (v: unknown) => { this.children = this.children.filter(c => c !== v); },
    };
    constructor(public opts?: any) { super(); fx.windows.push(this); }
    getContentSize() { return [...this.size]; }
    setContentSize(w: number, h: number) { this.size = [w, h]; }
    getBounds() { return { x: 0, y: 0, width: this.size[0], height: this.size[1] }; }
    isDestroyed() { return this.destroyed; }
    loadURL(u: string) { return this.webContents.loadURL(u); }
  }
  return { WebContentsView, BrowserWindow, screen: { getDisplayMatching: () => ({ workArea: { width: fx.screenWidth } }) } };
});

import { BrowserWindow } from 'electron';
import {
  BROWSER_PARTITION, BrowserClosed, browserHandlers, canWiden, createRightBrowser, electronViewHost, openLoginWindows,
  viewBounds, type BrowserState, type RightBrowser,
} from '../../electron/main/browser';
import { fakeHost, type FakeHost } from './browser-fake-host';

let host: FakeHost;
let rb: RightBrowser;
let states: BrowserState[];
let made: number;

beforeEach(() => {
  host = fakeHost();
  states = [];
  made = 0;
  rb = createRightBrowser(() => { made++; host.destroyed = false; return host; }, s => states.push(s));
  fx.views.length = 0;
  fx.windows.length = 0;
  fx.screenWidth = 1920;
  fx.attachThrows = false;
  // Keep page loads off the network: the fake host only needs a URL
  host.load = async (url: string) => { host.history.push(url); (host as any)._cur = url; };
  host.currentUrl = () => (host as any)._cur ?? '';
});

describe('right-side browser', () => {
  test('B-06 App 启动时浏览器是关着的，不记住上次的状态', async () => {
    expect(rb.state()).toEqual({ open: false, mode: 'pip', url: '', canGoBack: false });
    expect(made).toBe(0);
    expect(rb.url()).toBe('');
    await expect(rb.evaluate('1')).rejects.toBeInstanceOf(BrowserClosed);
    await expect(rb.waitForResponse(/x/, 10)).rejects.toMatchObject({ name: 'BrowserClosed' });
    expect(await rb.waitForUrl(() => true, 10)).toBe(false);
    rb.setMode('expanded');
    rb.back();
    rb.reload();
    rb.close();
    expect(made).toBe(0);
    expect(states).toEqual([]);
  });

  test('B-01 后台自动操作时显示画中画（右下角）', async () => {
    await rb.open('https://bigmodel.cn/keys', { mode: 'pip' });
    expect(host.bounds).toEqual({ x: 980 - 18 - 300, y: 680 - 18 - 200 + 26, width: 300, height: 174 });
    expect(host.size.width).toBe(980);
    expect(rb.state()).toMatchObject({ open: true, mode: 'pip', url: 'https://bigmodel.cn/keys' });
  });

  test('B-02 要扫码或付款时自动放大，窗口加宽约 480px', async () => {
    await rb.open('https://bigmodel.cn/login', { mode: 'expanded' });
    expect(host.size.width).toBe(980 + 480);
    expect(host.bounds).toEqual({ x: 980, y: 40, width: 480, height: 640 });
    rb.show('expanded');
    expect(host.size.width).toBe(980 + 480);
  });

  test('B-02 屏幕不够宽时改成盖住右半边', async () => {
    host.screen = 1280;
    expect(canWiden(980, 1280)).toBe(false);
    await rb.open('https://bigmodel.cn/login', { mode: 'expanded' });
    expect(host.size.width).toBe(980);
    expect(host.bounds).toEqual({ x: 490, y: 40, width: 490, height: 640 });
    expect(viewBounds('expanded', { width: 981, height: 600 }, false)).toEqual({ x: 490, y: 40, width: 491, height: 560 });
  });

  test('B-03 点画中画或 🌐 → 放大；放大后能缩回画中画', async () => {
    await rb.open('https://x.example/', { mode: 'pip' });
    rb.show('expanded');
    expect(rb.state().mode).toBe('expanded');
    expect(host.size.width).toBe(1460);
    rb.show('pip');
    expect(rb.state().mode).toBe('pip');
    expect(host.size.width).toBe(980);
    const h = browserHandlers(rb);
    h['browser:show']({ mode: 'expanded' });
    expect(rb.state().mode).toBe('expanded');
  });

  test('B-03 🌐 在关着时也能打开一个空的浏览器', () => {
    rb.show('expanded');
    expect(made).toBe(1);
    expect(rb.state()).toMatchObject({ open: true, mode: 'expanded' });
  });

  test('B-04 只有点 ✕ 才关；关掉时窗口缩回原宽', async () => {
    await rb.open('https://x.example/a', { mode: 'expanded' });
    const h = browserHandlers(rb);
    h['browser:back']();
    h['browser:reload']();
    expect(rb.state().open).toBe(true);
    h['browser:close']();
    expect(rb.state().open).toBe(false);
    expect(host.destroyed).toBe(true);
    expect(host.size.width).toBe(980);
    expect(states[states.length - 1]).toEqual({ open: false, mode: 'pip', url: '', canGoBack: false });
    // Reopening starts fresh (new view), PiP is the default mode
    await rb.open('https://x.example/b', { mode: 'pip' });
    expect(made).toBe(2);
  });

  test('B-04 关掉时正在等的登录和 Key 都算取消', async () => {
    await rb.open('https://x.example/login', { mode: 'pip' });
    const url = rb.waitForUrl(u => u.includes('done'), 5000);
    const resp = rb.waitForResponse(/api/, 5000);
    rb.close();
    expect(await url).toBe(false);
    await expect(resp).rejects.toBeInstanceOf(BrowserClosed);
    await rb.open('https://x.example/', { mode: 'pip' });
    rb.close();
    expect(host.size.width).toBe(980);
  });

  test('B-05 地址栏只读；后退、刷新可用', async () => {
    const real = fakeHost();
    const b = createRightBrowser(() => real, s => states.push(s));
    b.back();
    real.load = async (url: string) => { real.history.push(url); };
    real.currentUrl = () => real.history[real.history.length - 1] ?? '';
    await b.open('https://x.example/1', { mode: 'expanded' });
    expect(b.state().canGoBack).toBe(false);
    b.back();
    expect(b.url()).toBe('https://x.example/1');
    await b.open('https://x.example/2', { mode: 'expanded' });
    expect(b.state()).toMatchObject({ url: 'https://x.example/2', canGoBack: true });
    b.back();
    expect(b.url()).toBe('https://x.example/1');
    const before = states.length;
    b.reload();
    expect(states.length).toBe(before + 1);
  });

  test('B-02 窗口大小变了，网页跟着放好', async () => {
    await rb.open('https://x.example/', { mode: 'pip' });
    host.resize(1200, 800);
    expect(host.bounds).toEqual({ x: 1200 - 318, y: 800 - 218 + 26, width: 300, height: 174 });
  });

  test('M-08 等登录：已经在登录后的页面就直接算成功；等不到算超时', async () => {
    await rb.open('https://x.example/console', { mode: 'pip' });
    expect(await rb.waitForUrl(u => u.endsWith('/console'), 10)).toBe(true);
    expect(await rb.waitForUrl(u => u.endsWith('/never'), 10)).toBe(false);
    await expect(rb.waitForResponse(/never/, 10)).rejects.toThrow('timeout');
    expect(await rb.evaluate<number>('1')).toBe(1);
  });

  test('M-08 打开页面时被重定向打断也不报错', async () => {
    host.load = async () => { throw new Error('ERR_ABORTED'); };
    await expect(rb.open('https://x.example/', { mode: 'pip' })).resolves.toBeUndefined();
  });
});

describe('electron view host', () => {
  const win = () => new (BrowserWindow as any)() as any;

  test('B-07 浏览器的登录数据单独存，不碰用户的 Chrome', () => {
    const w = win();
    const h = electronViewHost(w);
    expect(fx.views[0].opts.webPreferences).toMatchObject({ partition: BROWSER_PARTITION, sandbox: true, nodeIntegration: false });
    expect(BROWSER_PARTITION).toBe('persist:codexbuddy-browser');
    expect(w.children).toContain(fx.views[0]);
    h.destroy();
    expect(w.children).toEqual([]);
    expect(fx.views[0].webContents.closed).toBe(true);
  });

  test('B-01 B-02 真窗口：画中画、放大加宽、关掉缩回', async () => {
    const w = win();
    const b = createRightBrowser(() => electronViewHost(w));
    await b.open('https://bigmodel.cn/login', { mode: 'expanded' });
    expect(w.size).toEqual([1460, 680]);
    expect(fx.views[0].bounds).toEqual({ x: 980, y: 40, width: 480, height: 640 });
    expect(b.state()).toMatchObject({ url: 'https://bigmodel.cn/login', canGoBack: true });
    b.setMode('pip');
    expect(w.size).toEqual([980, 680]);
    w.size = [1000, 700];
    w.emit('resize');
    expect(fx.views[0].bounds).toEqual({ x: 1000 - 318, y: 700 - 218 + 26, width: 300, height: 174 });
    b.back();
    b.reload();
    expect(fx.views[0].webContents.history.back).toBe(1);
    expect(fx.views[0].webContents.reloads).toBe(1);
    expect(await b.evaluate('2')).toBe('ran:2');
    b.close();
    expect(w.listenerCount('resize')).toBe(0);
    fx.screenWidth = 1000;
    await b.open('https://bigmodel.cn/fail', { mode: 'expanded' });
    expect(w.size).toEqual([1000, 700]);
  });

  test('M-08 第二级：从页面网络响应里读到 Key（含 base64）', async () => {
    const w = win();
    const b = createRightBrowser(() => electronViewHost(w));
    await b.open('https://platform.deepseek.com/api_keys', { mode: 'expanded' });
    const dbg = fx.views[0].webContents.debugger;
    expect(dbg.attached).toBe(true);
    const p = b.waitForResponse(/api_keys/, 1000);
    dbg.emit('message', {}, 'Network.responseReceived', { requestId: 'r1', response: { url: 'https://platform.deepseek.com/static.js' } });
    dbg.emit('message', {}, 'Network.loadingFinished', { requestId: 'r1' });
    dbg.emit('message', {}, 'Network.loadingFinished', { requestId: 'unknown' });
    dbg.emit('message', {}, 'Network.responseReceived', { requestId: 'r2', response: { url: 'https://platform.deepseek.com/api/api_keys' } });
    dbg.emit('message', {}, 'Network.loadingFinished', { requestId: 'r2' });
    expect(await p).toBe('body-r2');
    const q = b.waitForResponse(/api_keys/, 1000);
    dbg.emit('message', {}, 'Network.responseReceived', { requestId: 'b64', response: { url: 'https://platform.deepseek.com/api_keys' } });
    dbg.emit('message', {}, 'Network.loadingFinished', { requestId: 'b64' });
    expect(await q).toBe('{"key":"sk-base64base64base64"}');
    // Popups stay in the same view
    const wc = fx.views[0].webContents;
    expect(wc.openHandler({ url: 'https://platform.deepseek.com/qr' })).toEqual({ action: 'deny' });
    await new Promise(r => setTimeout(r, 0));
    expect(wc.url).toBe('https://platform.deepseek.com/qr');
    wc.emit('did-navigate-in-page');
    w.destroyed = true;
    b.close();
  });

  test('M-08 调试通道被占用时不崩，退到粘贴', () => {
    fx.attachThrows = true;
    const h = electronViewHost(win());
    expect(() => h.destroy()).not.toThrow();
  });

  test('B-07 一次性打开 7 家登录页：都用同一个独立分区', () => {
    const ws = openLoginWindows(['https://a.example/login', 'https://b.example/fail']) as any[];
    expect(ws).toHaveLength(2);
    for (const w of ws) expect(w.opts.webPreferences.partition).toBe(BROWSER_PARTITION);
    expect(ws[0].webContents.url).toBe('https://a.example/login');
  });
});
