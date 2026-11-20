// L2: the right-side browser — PiP / expanded layout, window widening, close = cancel, own partition. The controller
// runs against a fake view host; the Electron view host runs against a mocked electron module. Owner: A4.
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const fx = vi.hoisted(() => ({ views: [] as any[], windows: [] as any[], screenWidth: 1920, attachThrows: false }));
const area = () => ({ x: 0, y: 0, width: fx.screenWidth, height: 1040 });

vi.mock('electron', async () => {
  const { EventEmitter: EE } = await import('node:events');
  class FakeWebContents extends EE {
    url = '';
    closed = false;
    openHandler: ((d: { url: string }) => unknown) | null = null;
    history = { back: 0, canGoBack: () => true, goBack: () => { this.history.back++; } };
    navigationHistory = { canGoBack: () => this.history.canGoBack(), goBack: () => this.history.goBack() };
    reloads = 0;
    webrtc = '';
    session = { cookies: { get: async ({ name }: { name: string }) => (name === 'login_ticket' ? [{ name }] : []) } };
    setWebRTCIPHandlingPolicy(p: string) { this.webrtc = p; }
    zoom = 1;
    setZoomFactor(f: number) { this.zoom = f; }
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
    isDestroyed() { return this.closed; }
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
    pos = [0, 0];
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
    getBounds() { return { x: this.pos[0], y: this.pos[1], width: this.size[0], height: this.size[1] }; }
    setPosition(x: number, y: number) { this.pos = [x, y]; }
    isDestroyed() { return this.destroyed; }
    menuRemoved = false;
    removeMenu() { this.menuRemoved = true; }
    loadURL(u: string) { return this.webContents.loadURL(u); }
  }
  return { WebContentsView, BrowserWindow, screen: { getDisplayMatching: () => ({ workArea: area() }) } };
});

import { BrowserWindow } from 'electron';
import {
  BROWSER_PARTITION, BrowserClosed, browserHandlers, createRightBrowser, electronViewHost, keepOnScreen, openLoginWindows,
  MIN_PAGE_WIDTH, pageZoom, SLIDE_MS, viewBounds, widenBy, type BrowserState, type RightBrowser,
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
    expect(rb.state()).toEqual({ open: false, mode: 'pip', url: '', canGoBack: false, width: 0 });
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
    expect(host.bounds).toEqual({ x: 980 - 17 - 318, y: 680 - 17 - 208 + 31, width: 318, height: 177 });
    expect(host.size.width).toBe(980);
    expect(rb.state()).toMatchObject({ open: true, mode: 'pip', url: 'https://bigmodel.cn/keys' });
  });

  test('B-02 要扫码或付款时自动放大，窗口加宽约 480px', async () => {
    await rb.open('https://bigmodel.cn/login', { mode: 'expanded' });
    expect(host.size.width).toBe(980 + 480);
    expect(host.bounds).toEqual({ x: 980, y: 53, width: 480, height: 627 });
    rb.show('expanded');
    expect(host.size.width).toBe(980 + 480);
  });

  test('B-02 屏幕差一点不够 480px 时按屏幕能放下的加宽（1440 宽的屏加 460）', async () => {
    host.screen = 1440;
    expect(widenBy(980, 1440)).toBe(460);
    await rb.open('https://bigmodel.cn/login', { mode: 'expanded' });
    expect(host.size.width).toBe(1440);
    expect(host.bounds).toEqual({ x: 960, y: 53, width: 480, height: 627 });
    rb.show('pip');
    expect(host.size.width).toBe(980);
    rb.show('expanded');
    rb.close();
    expect(host.size.width).toBe(980);
  });

  test('B-02 屏幕不够宽时改成盖住右半边', async () => {
    host.screen = 1280;
    expect(widenBy(980, 1280)).toBe(0);
    expect(widenBy(980, 1380)).toBe(400);
    await rb.open('https://bigmodel.cn/login', { mode: 'expanded' });
    expect(host.size.width).toBe(980);
    expect(host.bounds).toEqual({ x: 490, y: 53, width: 490, height: 627 });
    expect(viewBounds('expanded', { width: 981, height: 600 }, false)).toEqual({ x: 490, y: 53, width: 491, height: 547 });
  });

  test('B-08 官网按至少 820px 宽排版再缩到视图里，窄视图也有微信扫码（智谱、MiniMax 窄了会藏二维码）', async () => {
    expect(MIN_PAGE_WIDTH).toBe(820);
    expect(pageZoom(820)).toBe(1);
    expect(pageZoom(1200)).toBe(1);
    expect(pageZoom(410)).toBe(0.5);
    await rb.open('https://bigmodel.cn/login', { mode: 'expanded' });
    expect(host.zoom).toBeCloseTo(480 / 820);
    rb.show('pip');
    expect(host.zoom).toBeCloseTo(318 / 820);
    host.screen = 1280;
    rb.show('expanded');
    expect(host.zoom).toBeCloseTo(490 / 820);
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
    expect(states[states.length - 1]).toEqual({ open: false, mode: 'pip', url: '', canGoBack: false, width: 0 });
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
    expect(host.bounds).toEqual({ x: 1200 - 335, y: 800 - 225 + 31, width: 318, height: 177 });
  });

  test('B-02 状态里带展开后网页占的宽度：加宽了是 480，没加宽是半个窗口，画中画是 0；窗口变了再报一次', async () => {
    await rb.open('https://x.example/', { mode: 'pip' });
    expect(rb.state().width).toBe(0);
    rb.show('expanded');
    expect(rb.state().width).toBe(host.bounds!.width);
    const n = states.length;
    host.resize(1000, 700);
    expect(states.length).toBe(n + 1);
    expect(states.at(-1)!.width).toBe(host.bounds!.width);
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
    expect(fx.views[0].webContents.webrtc).toBe('disable_non_proxied_udp');
    expect(BROWSER_PARTITION).toBe('persist:codexbuddy-browser');
    expect(w.children).toContain(fx.views[0]);
    h.destroy();
    expect(w.children).toEqual([]);
    expect(fx.views[0].webContents.closed).toBe(true);
  });

  test('B-02 真窗口：加宽后右边出了屏幕就往左挪，缩回时挪回原处；在屏幕外的测试窗口不挪', async () => {
    fx.screenWidth = 1440;
    const w = win();
    w.pos = [230, 100];
    const b = createRightBrowser(() => electronViewHost(w));
    await b.open('https://bigmodel.cn/login', { mode: 'expanded' });
    expect(w.size).toEqual([1440, 680]);
    expect(w.pos).toEqual([0, 100]);
    b.setMode('pip');
    expect(w.size).toEqual([980, 680]);
    expect(w.pos).toEqual([230, 100]);
    expect(fx.views.at(-1).webContents.zoom).toBeCloseTo(318 / 820);
    // Chromium zooms per site: another site would open at 100% without this
    fx.views.at(-1).webContents.zoom = 1;
    fx.views.at(-1).webContents.emit('did-navigate');
    expect(fx.views.at(-1).webContents.zoom).toBeCloseTo(318 / 820);
    b.close();
    const off = win();
    off.pos = [-30000, -30000];
    const c = createRightBrowser(() => electronViewHost(off));
    await c.open('https://bigmodel.cn/login', { mode: 'expanded' });
    expect(off.size).toEqual([1440, 680]);
    expect(off.pos).toEqual([-30000, -30000]);
    c.close();
    expect(off.size).toEqual([980, 680]);
  });

  test('B-02 keepOnScreen：没出屏幕不挪，比屏幕还宽就贴左边', () => {
    const scr = { x: 0, y: 0, width: 1440, height: 900 };
    expect(keepOnScreen({ x: 100, y: 0, width: 980, height: 680 }, { x: 100, y: 0, width: 1440 - 100, height: 680 }, scr)).toBeNull();
    expect(keepOnScreen({ x: 300, y: 0, width: 980, height: 680 }, { x: 300, y: 0, width: 1460, height: 680 }, scr)).toBe(0);
    expect(keepOnScreen({ x: 1500, y: 0, width: 980, height: 680 }, { x: 1500, y: 0, width: 1460, height: 680 }, scr)).toBeNull();
  });

  test('B-01 B-02 真窗口：画中画、放大加宽、关掉缩回', async () => {
    const w = win();
    const b = createRightBrowser(() => electronViewHost(w));
    await b.open('https://bigmodel.cn/login', { mode: 'expanded' });
    expect(w.size).toEqual([1460, 680]);
    // slides in from the window's right edge with the page (SLIDE_MS), then sits at its place
    expect(fx.views[0].bounds).toEqual({ x: 1460, y: 53, width: 480, height: 627 });
    await new Promise(r => setTimeout(r, SLIDE_MS + 60));
    expect(fx.views[0].bounds).toEqual({ x: 980, y: 53, width: 480, height: 627 });
    expect(b.state()).toMatchObject({ url: 'https://bigmodel.cn/login', canGoBack: true });
    b.setMode('pip');
    expect(w.size).toEqual([980, 680]);
    w.size = [1000, 700];
    w.emit('resize');
    expect(fx.views[0].bounds).toEqual({ x: 1000 - 335, y: 700 - 225 + 31, width: 318, height: 177 });
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
    b.close(); // closed in the middle of sliding in: the slide stops with it
    const last = fx.views[1].bounds;
    await new Promise(r => setTimeout(r, 80));
    expect(fx.views[1].bounds).toEqual(last);
  });

  test('M-08 第二级：从页面网络响应里读到 Key（含 base64）', async () => {
    const w = win();
    const b = createRightBrowser(() => electronViewHost(w));
    await expect(b.hasCookie('https://x.example/', 'login_ticket')).rejects.toThrow(BrowserClosed);
    await b.open('https://platform.deepseek.com/api_keys', { mode: 'expanded' });
    const dbg = fx.views[0].webContents.debugger;
    expect(dbg.attached).toBe(true);
    // Logins a URL cannot tell are read from the partition's cookies (百炼)
    expect(await b.hasCookie('https://bailian.console.aliyun.com/', 'login_ticket')).toBe(true);
    expect(await b.hasCookie('https://bailian.console.aliyun.com/', 'other')).toBe(false);
    const p = b.waitForResponse(/api_keys/, 1000);
    const sent = (requestId: string, method: string) => dbg.emit('message', {}, 'Network.requestWillBeSent', { requestId, request: { method } });
    // A GET of the key list (masked keys, session tokens) is never a new key: not reported
    sent('g1', 'GET');
    dbg.emit('message', {}, 'Network.responseReceived', { requestId: 'g1', response: { url: 'https://platform.deepseek.com/api/api_keys' } });
    dbg.emit('message', {}, 'Network.loadingFinished', { requestId: 'g1' });
    for (const id of ['r1', 'r2', 'b64']) sent(id, 'post');
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

  test('B-07 一次性打开 7 家登录页：都用同一个独立分区，标题写厂商，换页面时报告网址', async () => {
    const seen: [number, string][] = [];
    const ws = openLoginWindows([{ url: 'https://a.example/login', name: '智谱' }, { url: 'https://b.example/fail', name: 'Kimi' }], (i, u) => seen.push([i, u])) as any[];
    expect(ws).toHaveLength(2);
    for (const w of ws) expect(w.opts.webPreferences.partition).toBe(BROWSER_PARTITION);
    expect(ws.map(w => w.opts.title)).toEqual(['CodexBuddy 登录：智谱', 'CodexBuddy 登录：Kimi']);
    // Under ~800px 智谱 and MiniMax hide the WeChat QR code
    for (const w of ws) expect(w.opts.width).toBeGreaterThanOrEqual(MIN_PAGE_WIDTH);
    expect(ws.every(w => w.menuRemoved && w.webContents.webrtc === 'disable_non_proxied_udp')).toBe(true);
    await Promise.resolve();
    expect(ws[0].webContents.url).toBe('https://a.example/login');
    expect(seen).toEqual([[0, 'https://a.example/login']]);
    ws[1].webContents.url = 'https://b.example/console';
    ws[1].webContents.emit('did-navigate-in-page');
    expect(seen.at(-1)).toEqual([1, 'https://b.example/console']);
    const e = { prevented: false, preventDefault() { this.prevented = true; } };
    ws[0].emit('page-title-updated', e);
    expect(e.prevented).toBe(true);
    openLoginWindows([{ url: 'https://c.example/', name: 'X' }]);
  });
});
