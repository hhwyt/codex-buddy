// L2: vendor flows (login, key ladder, recharge) through the real right-browser controller against the fake vendor
// server. Owner: A4.
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({}));
import { parseEndpoints, withEndpoints } from '../../electron/core/endpoints';
import { PROVIDERS, providerOf } from '../../electron/core/providers';
import { createRightBrowser, type RightBrowser } from '../../electron/main/browser';
import {
  consoleHosts, createKeyScript, defaultKeyResponse, defaultLoggedIn, extractKey, makeVendor,
} from '../../electron/vendors/base';
import { VENDORS, batchLoginTargets, loginWindowTargets, vendorsWith } from '../../electron/vendors/index';
import type { BrowserDriver } from '../../electron/vendors/types';
import { startVendorServer } from '../fakes/vendor-server.mjs';
import { fakeHost, type FakeHost } from './browser-fake-host';

type Server = Awaited<ReturnType<typeof startVendorServer>>;
let server: Server;
let host: FakeHost;
let rb: RightBrowser;

const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('until: timed out');
    await new Promise(r => setTimeout(r, 5));
  }
};
const endpoints = () => parseEndpoints(JSON.stringify({ vendors: Object.fromEntries(PROVIDERS.map(p => [p.id, server.vendorUrl(p.id)])) }));
const fast = { loginMs: 2000, createMs: 400 };

beforeAll(async () => { server = await startVendorServer(); });
afterAll(async () => { await server.close(); });
beforeEach(() => {
  server.state.scenario = 'ok';
  server.state.perVendor = {};
  server.state.keys = {};
  server.state.requests.length = 0;
  host = fakeHost();
  rb = createRightBrowser(() => { host.destroyed = false; return host; });
});

describe('key ladder', () => {
  test('M-08 智谱第一次用：右侧浏览器放大到登录页 → 扫码 → 自动建 Key → ✓ 能用', async () => {
    const zhipu = vendorsWith(endpoints()).zhipu;
    const p = zhipu.obtainKey(rb);
    await until(() => host.currentUrl().endsWith('/zhipu/login'));
    expect(rb.state()).toMatchObject({ open: true, mode: 'expanded' });
    expect(host.size.width).toBe(980 + 480);
    await host.userLogsIn();
    const r = await p;
    expect(r).toEqual({ ok: true, key: server.state.keys.zhipu[0], level: 1 });
    // Key created in PiP, named CodexBuddy, with the page's login cookie
    expect(rb.state().mode).toBe('pip');
    expect(host.size.width).toBe(980);
    const create = server.state.requests.find((q: { path: string; method: string; body?: unknown }) => q.path === '/api/keys');
    expect(create?.body).toEqual({ name: 'CodexBuddy' });
  });

  test('M-09 扫码中关掉右侧浏览器 = 取消，什么都没改', async () => {
    const p = vendorsWith(endpoints()).deepseek.obtainKey(rb);
    await until(() => host.currentUrl().endsWith('/login'));
    rb.close();
    expect(await p).toEqual({ ok: false, reason: 'cancelled' });
    expect(server.state.keys.deepseek).toBeUndefined();
    expect(host.destroyed).toBe(true);
    expect(rb.state().open).toBe(false);
  });

  test('M-09 一直没扫码等到超时也算取消', async () => {
    const v = makeVendor(withEndpoints(providerOf('kimi'), endpoints()), { timeouts: { loginMs: 50, createMs: 50 } });
    expect(await v.obtainKey(rb)).toEqual({ ok: false, reason: 'cancelled' });
  });

  test('M-10 建 Key 失败 → 返回原因 → 再试一次能成', async () => {
    const kimi = vendorsWith(endpoints()).kimi;
    server.setScenario('keyfail', 'kimi');
    const p = kimi.obtainKey(rb);
    await until(() => host.currentUrl().endsWith('/login'));
    await host.userLogsIn();
    const r = await p;
    expect(r).toEqual({ ok: false, reason: 'failed', detail: '厂商那边没建成 Key，等一下再试' });
    expect(r.ok ? '' : r.detail).not.toMatch(/[。！.]$/);
    server.setScenario('ok', 'kimi');
    const again = await kimi.obtainKey(rb);
    expect(again).toMatchObject({ ok: true, level: 1 });
  });

  test('M-17 换 Key：已登录时直接建新 Key，和旧的不一样', async () => {
    const qwen = vendorsWith(endpoints()).qwen;
    const p = qwen.obtainKey(rb);
    await until(() => host.currentUrl().endsWith('/login'));
    await host.userLogsIn();
    const first = await p;
    const loginsBefore = host.history.filter(u => u.endsWith('/login')).length;
    const second = await qwen.obtainKey(rb);
    expect(first.ok && second.ok).toBe(true);
    expect(first.ok && second.ok && first.key !== second.key).toBe(true);
    expect(host.history.filter(u => u.endsWith('/login')).length).toBe(loginsBefore);
    expect(server.state.keys.qwen).toHaveLength(2);
  });

  test('M-08 第二级：没有控制台接口时，用户点「创建」从页面响应里接住 Key', async () => {
    const v = makeVendor(withEndpoints(providerOf('minimax'), endpoints()), { timeouts: fast });
    const p = v.obtainKey(rb);
    await until(() => host.currentUrl().endsWith('/login'));
    await host.userLogsIn();
    await until(() => host.history.filter(u => u.endsWith('/keys')).length >= 2);
    expect(rb.state().mode).toBe('expanded');
    // The page first loads the masked key list: not a key, keep waiting
    await host.pageFetch(`${server.vendorUrl('minimax')}/keys`);
    await host.userCreatesKey();
    const r = await p;
    expect(r).toEqual({ ok: true, key: server.state.keys.minimax[0], level: 2 });
    expect(rb.state().mode).toBe('pip');
  });

  test('M-08 第一级接口不认（401）时退到第二级', async () => {
    const v = makeVendor(withEndpoints(providerOf('hunyuan'), endpoints()), {
      createKeyUrl: `${server.vendorUrl('hunyuan')}/api/keys`, timeouts: fast,
      loggedIn: url => url.endsWith('/keys'),
    });
    await host.load(`${server.vendorUrl('hunyuan')}/keys`); // looks logged in, but no cookie → 401
    rb.show('pip');
    const p = v.obtainKey(rb);
    await until(() => server.state.requests.some((q: { path: string; method: string; body?: unknown }) => q.path === '/api/keys'));
    await until(() => host.history.filter(u => u.endsWith('/keys')).length >= 2);
    expect(rb.state().mode).toBe('expanded');
    await host.userLogsIn();
    await host.userCreatesKey();
    expect(await p).toMatchObject({ ok: true, level: 2 });
  });

  test('M-08 第三级：等不到 Key 就露出隐藏的「粘贴 Key」', async () => {
    const v = makeVendor(withEndpoints(providerOf('deepseek'), endpoints()), { timeouts: fast });
    const p = v.obtainKey(rb);
    await until(() => host.currentUrl().endsWith('/login'));
    await host.userLogsIn();
    expect(await p).toEqual({ ok: false, reason: 'need-paste' });
  });

  test('M-09 等用户点「创建」时关掉浏览器 = 取消', async () => {
    const v = makeVendor(withEndpoints(providerOf('deepseek'), endpoints()), { timeouts: { loginMs: 2000, createMs: 5000 } });
    const p = v.obtainKey(rb);
    await until(() => host.currentUrl().endsWith('/login'));
    await host.userLogsIn();
    await until(() => rb.state().mode === 'expanded' && host.history.filter(u => u.endsWith('/keys')).length >= 2);
    rb.close();
    expect(await p).toEqual({ ok: false, reason: 'cancelled' });
  });

  test('M-10 第一级脚本跑不起来时退到第二级，浏览器出意外时说清楚', async () => {
    const calls: string[] = [];
    const driver = (over: Partial<BrowserDriver>): BrowserDriver => ({
      open: async u => { calls.push(u); }, url: () => 'http://127.0.0.1:1/zhipu/keys', setMode: () => {},
      evaluate: async () => { throw new Error('script error'); },
      waitForResponse: async () => { const e = new Error('closed'); e.name = 'BrowserClosed'; throw e; },
      waitForUrl: async () => true, ...over,
    });
    const v = makeVendor(withEndpoints(providerOf('zhipu'), endpoints()), { createKeyUrl: 'http://127.0.0.1:1/zhipu/api/keys', loggedIn: () => true });
    expect(await v.obtainKey(driver({}))).toEqual({ ok: false, reason: 'cancelled' });
    const closedEval = driver({ evaluate: async () => { const e = new Error('x'); e.name = 'BrowserClosed'; throw e; } });
    expect(await v.obtainKey(closedEval)).toEqual({ ok: false, reason: 'cancelled' });
    const broken = driver({ open: async () => { throw new Error('boom'); } });
    expect(await v.obtainKey(broken)).toEqual({ ok: false, reason: 'failed', detail: '右侧浏览器出了点问题，再试一次' });
    const noKey = driver({ evaluate: async <T>() => ({ status: 200, body: '{"ok":true}' }) as T });
    expect(await v.obtainKey(noKey)).toEqual({ ok: false, reason: 'cancelled' });
  });

  test('M-22 OpenAI 官方账号不走 Key，在 Codex 里登录', async () => {
    const r = await VENDORS.openai.obtainKey(rb);
    expect(r).toMatchObject({ ok: false, reason: 'failed' });
    expect(rb.state().open).toBe(false);
  });
});

describe('recharge and key pages', () => {
  test('M-13 余额不够 → 充值页放大', async () => {
    const v = vendorsWith(endpoints()).deepseek;
    expect(await v.openRecharge(rb)).toBe(true);
    expect(host.currentUrl()).toBe(`${server.vendorUrl('deepseek')}/recharge`);
    expect(rb.state().mode).toBe('expanded');
    expect(host.size.width).toBe(980 + 480);
  });

  test('M-18 去充值：打开官方充值页，App 不替用户点付款按钮', async () => {
    const v = vendorsWith(endpoints()).kimi;
    await v.openRecharge(rb);
    expect(host.scripts).toEqual([]);
    expect(server.state.requests.filter((q: { path: string; method: string; body?: unknown }) => q.method !== 'GET')).toEqual([]);
    expect(await VENDORS.openai.openRecharge(rb)).toBe(false);
  });

  test('S-03 打开官方 Key 管理页', async () => {
    await vendorsWith(endpoints()).zhipu.openKeyManagement(rb);
    expect(host.currentUrl()).toBe(`${server.vendorUrl('zhipu')}/keys`);
    expect(rb.state().mode).toBe('expanded');
  });
});

describe('vendor details', () => {
  test('M-08 识别登录成功：在控制台域名上、不在登录页', () => {
    const z = defaultLoggedIn(providerOf('zhipu'));
    expect(z(providerOf('zhipu').loginUrl)).toBe(false);
    expect(z('https://bigmodel.cn/usercenter/proj-mgmt/apikeys')).toBe(true);
    expect(z('https://evil.example/usercenter')).toBe(false);
    expect(z('not a url')).toBe(false);
    const h = defaultLoggedIn(providerOf('hunyuan'));
    expect(h('https://cloud.tencent.com/login')).toBe(false);
    expect(h('https://console.cloud.tencent.com/hunyuan/start')).toBe(true);
    expect(VENDORS.deepseek.isLoggedIn('https://platform.deepseek.com/sign_in')).toBe(false);
    expect(VENDORS.deepseek.isLoggedIn('https://platform.deepseek.com/api_keys')).toBe(true);
    expect(consoleHosts(providerOf('openai'))).toEqual(['platform.openai.com']);
    // Every login page reads as logged out, so the flow waits for the scan (百炼's console URL looks the same logged out)
    for (const v of Object.values(VENDORS)) if (!v.provider.officialAccount) expect(v.isLoggedIn(v.provider.loginUrl)).toBe(false);
    expect(VENDORS.qwen.isLoggedIn('https://bailian.console.aliyun.com/')).toBe(true);
  });

  test('M-08 控制台跳到新域名也认得出登录成功（Kimi → platform.kimi.com，MiniMax → platform.minimax.cn）', () => {
    expect(VENDORS.kimi.isLoggedIn('https://platform.kimi.com/console/api-keys')).toBe(true);
    expect(VENDORS.kimi.isLoggedIn('https://platform.kimi.com/login')).toBe(false);
    expect(VENDORS.minimax.isLoggedIn('https://platform.minimax.cn/user-center/basic-information/interface-key')).toBe(true);
    expect(providerOf('minimax').loginUrl).toBe('https://platform.minimax.cn/login');
    expect(consoleHosts(providerOf('kimi'))).not.toContain('api.moonshot.cn');
  });

  test('M-08 从响应里认出没打码的 Key', () => {
    expect(extractKey('{"data":{"apiKey":"0123456789abcdef0123.ABCDEFGH"}}')).toBe('0123456789abcdef0123.ABCDEFGH');
    expect(extractKey('{"list":[{"key":"sk-****abcd"}]}')).toBeNull();
    expect(extractKey('{"items":[{"name":"x","secret":"short"}],"raw":"sk-abcdefghijklmnop1234"}')).toBe('sk-abcdefghijklmnop1234');
    expect(extractKey('plain text sk-abcdefghijklmnop1234 end')).toBe('sk-abcdefghijklmnop1234');
    expect(extractKey('<html>nothing</html>')).toBeNull();
    expect(extractKey('{"nested":[[{"token":"eyJhbGciOiJIUzI1NiJ9.payload_part.sig"}]]}')).toBe('eyJhbGciOiJIUzI1NiJ9.payload_part.sig');
    expect(extractKey('{"a":1}')).toBeNull();
  });

  test('M-08 第二级只看厂商控制台上和 Key 有关的响应', () => {
    const re = defaultKeyResponse(providerOf('deepseek'));
    expect(re.test('https://platform.deepseek.com/api/v0/users/api_keys')).toBe(true);
    expect(re.test('https://platform.deepseek.com/static/app.js')).toBe(false);
    expect(re.test('https://evil.example/api_keys')).toBe(false);
  });

  test('M-08 建 Key 脚本用页面自己的登录态、名字叫 CodexBuddy', () => {
    const s = createKeyScript('https://x.example/api/keys');
    expect(s).toContain("credentials: 'include'");
    expect(s).toContain('"CodexBuddy"');
  });

  test('B-07 一次性打开 7 家登录页：6 家在自己的浏览器里，OpenAI 用系统浏览器', () => {
    const t = batchLoginTargets(VENDORS);
    expect(t.inApp).toHaveLength(6);
    expect(t.inApp).toContain(providerOf('zhipu').loginUrl);
    expect(t.external).toEqual([providerOf('openai').loginUrl]);
    expect(vendorsWith(parseEndpoints(undefined))).toEqual(VENDORS);
    const named = loginWindowTargets(VENDORS);
    expect(named.map(t => t.name)).toEqual(['DeepSeek', '智谱', 'Kimi', 'Qwen', 'MiniMax', '混元']);
    expect(named.map(t => t.url)).toEqual(t.inApp);
  });
});
