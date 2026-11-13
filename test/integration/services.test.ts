// Main-process services (every IPC handler) against a temp sandbox, the sandbox Codex stand-ins and the fake Codex CLI.
// Nothing here touches the real ~/.codex or /Applications.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { PROVIDERS } from '../../electron/core/providers';
import { validateRemote } from '../../electron/core/remote';
import type { BuiltinVendorId, RemoteConfig } from '../../electron/core/types';
import { aesCipher } from '../../electron/main/cipher';
import type { EventName } from '../../electron/main/ipc-contract';
import { createServices, explain, SOURCE_URL, type ServiceDeps } from '../../electron/main/services';
import { createMacPlatform } from '../../electron/platform/mac';
import { nodeFs } from '../../electron/platform/node-fs';
import { sandboxClone, sandboxPlatform, sandboxZh } from '../../electron/platform/sandbox-codex';
import { sandboxPaths } from '../../electron/platform/sandbox';
import type { CloneInfo, Clone, ZhLauncher } from '../../electron/platform/types';
import type { BrowserDriver, KeyOutcome, Vendor } from '../../electron/vendors/types';

const FAKE_CODEX = path.join(__dirname, '..', 'fakes', 'fake-codex.mjs');
const bundled = validateRemote(fs.readFileSync(path.join(__dirname, '..', '..', 'remote', 'config.json'), 'utf8'))!;

let root: string;
let events: { event: EventName; payload: unknown }[];
let opened: string[];
let external: string[];
let keyOutcome: Record<string, KeyOutcome>;
let clock: number;
let fetchText: (url: string) => Promise<string>;
let fetchBytes: ServiceDeps['fetchBytes'];
let zhSupported: boolean;
let installed: string[];

const scenario = (s: string) => fs.writeFileSync(path.join(root, 'home', 'fake-codex-scenario'), s);
const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({ CODEXBUDDY_FAKE_CODEX: FAKE_CODEX, CODEXBUDDY_NODE: process.execPath, CODEXBUDDY_FAKE_INSTALL_MS: '0', ...extra });

function fakeClone(paths: ReturnType<typeof sandboxPaths>): Clone & { zh: boolean | null } {
  const made = new Map<string, CloneInfo>();
  const c = {
    zh: null as boolean | null,
    list: async () => [...made.values()],
    make: async (spec: { slug: string }) => {
      const info = { slug: spec.slug, appPath: path.join(paths.appsDir, `${spec.slug}.app`), codexHome: paths.cloneHome(spec.slug) };
      fs.mkdirSync(info.codexHome, { recursive: true });
      fs.mkdirSync(info.appPath, { recursive: true });
      made.set(spec.slug, info);
      return info;
    },
    open: async () => {},
    remove: async (slug: string) => { const i = made.get(slug); if (i) fs.rmSync(i.appPath, { recursive: true }); made.delete(slug); },
    setZh: async (on: boolean) => { c.zh = on; },
  };
  return c;
}

function fakeZh(paths: ReturnType<typeof sandboxPaths>): ZhLauncher {
  return {
    exists: async () => fs.existsSync(paths.zhLauncherPath),
    add: async () => { fs.mkdirSync(paths.zhLauncherPath, { recursive: true }); },
    remove: async () => { fs.rmSync(paths.zhLauncherPath, { recursive: true, force: true }); },
    supported: async () => zhSupported,
  };
}

const fakeBrowser = (): BrowserDriver & { close(): void; closed: number; opens: string[] } => {
  const b = {
    closed: 0, opens: [] as string[],
    open: async (url: string) => { b.opens.push(url); },
    url: () => '', evaluate: async <T,>() => undefined as T, waitForResponse: async () => '',
    waitForUrl: async () => true, setMode: () => {}, close: () => { b.closed++; },
  };
  return b;
};

function fakeVendors(): Record<BuiltinVendorId, Vendor> {
  return Object.fromEntries(PROVIDERS.map(p => [p.id, {
    id: p.id, provider: p, isLoggedIn: () => true,
    obtainKey: async () => keyOutcome[p.id] ?? { ok: true, key: `sk-${p.id}-${randomBytes(4).toString('hex')}abcd`, level: 1 },
    openRecharge: async (b: BrowserDriver) => { if (!p.rechargeUrl) return false; await b.open(p.rechargeUrl, { mode: 'expanded' }); return true; },
    openKeyManagement: async (b: BrowserDriver) => { await b.open(p.keysUrl, { mode: 'expanded' }); },
  } satisfies Vendor])) as unknown as Record<BuiltinVendorId, Vendor>;
}

function build(opts: { env?: NodeJS.ProcessEnv; key?: Uint8Array; os?: 'mac' | 'win'; remoteUrls?: string[] } = {}) {
  const paths = sandboxPaths(root, 'mac');
  const base = createMacPlatform(paths);
  const platform = sandboxPlatform(base, { root, env: opts.env ?? env(), open: async t => { opened.push(t); }, reveal: async t => { opened.push(`reveal:${t}`); } });
  const clone = sandboxClone(fakeClone(paths), async t => { opened.push(t); });
  const zh = sandboxZh(fakeZh(paths), opts.env ?? env());
  const browser = fakeBrowser();
  const upstreams: Record<string, string> = {};
  const svc = createServices({
    platform, clone, zh, providers: PROVIDERS, vendors: fakeVendors(), browser,
    bridge: { baseUrlFor: (v, u) => { upstreams[v] = u; return `http://127.0.0.1:4555/${v}/v1`; }, isBridgeUrl: u => u.startsWith('http://127.0.0.1:4555') },
    cipher: aesCipher(opts.key ?? new Uint8Array(32).fill(7)),
    fetchText: url => fetchText(url), fetchBytes: url => fetchBytes(url),
    remoteUrls: opts.remoteUrls ?? ['https://cdn.jsdelivr.net/gh/x/y@main/remote/config.json', 'https://raw.githubusercontent.com/x/y/main/remote/config.json'],
    bundledRemote: bundled, version: '0.1.0', os: opts.os ?? 'mac',
    now: () => clock, emit: (event, payload) => { events.push({ event, payload }); },
    openExternal: async u => { external.push(u); }, clearBrowserData: async () => { external.push('clear'); },
    connections: () => ({ app: [{ host: 'cdn.jsdelivr.net', allowed: true, at: 1 }], web: [] }),
    logoPng: v => `/logos/${v}.png`,
    runInstaller: async f => { installed.push(f); },
  });
  return { svc, h: svc.handlers as Required<typeof svc.handlers>, paths, platform, browser, clone, upstreams };
}

const configOf = (home: string) => fs.readFileSync(path.join(home, 'config.toml'), 'utf8');
const catalogOf = (home: string) => {
  const p = /model_catalog_json\s*=\s*"([^"]+)"/.exec(configOf(home))?.[1];
  return p ? (JSON.parse(fs.readFileSync(p, 'utf8')) as { models: { slug: string; display_name: string }[] }).models : null;
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-svc-'));
  fs.mkdirSync(path.join(root, 'home', '.codex'), { recursive: true });
  events = []; opened = []; external = []; keyOutcome = {}; clock = 1_000_000; zhSupported = true; installed = [];
  fetchText = async () => { throw new Error('offline'); };
  fetchBytes = async () => { throw new Error('offline'); };
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

async function installed_(b: ReturnType<typeof build>) {
  const r = await b.h['install:run'](undefined as never);
  expect(r.ok).toBe(true);
}

describe('onboarding', () => {
  test('O-01 开始安装：沙盒里装好 Codex，步骤事件按顺序发出，装完算已配置', async () => {
    const b = build();
    expect((await b.h['app:state'](undefined as never)).configured).toBe(false);
    await installed_(b);
    const steps = events.filter(e => e.event === 'step').map(e => e.payload as { id: string; state: string; flow: string });
    expect(steps.every(s => s.flow === 'install')).toBe(true);
    expect(steps.map(s => `${s.id}:${s.state}`)).toEqual(['download:start', 'download:done', 'copy:start', 'copy:done', 'check:start', 'check:done']);
    const s = await b.h['app:state'](undefined as never);
    expect(s).toMatchObject({ configured: true, codexInstalled: true, codexRunning: false, os: 'mac', version: '0.1.0' });
  });

  test('O-02 已经装了 Codex：直接打勾，显示已装好', async () => {
    const b = build();
    await installed_(b);
    events = [];
    await installed_(b);
    expect(events.map(e => e.payload)).toEqual([{ flow: 'install', id: 'download', state: 'done', text: '已装好' }]);
  });

  test('O-03 下载失败一次：再试一次从下载接着装', async () => {
    const b = build({ env: env({ CODEXBUDDY_FAKE_INSTALL: 'fail-once' }) });
    const r1 = await b.h['install:run'](undefined as never);
    expect(r1).toEqual({ ok: false, reason: '下载没成功，检查一下网络再试' });
    expect(fs.existsSync(path.join(b.paths.buddyDir, 'downloads', 'Codex.dmg.part'))).toBe(true);
    expect((await b.h['install:run'](undefined as never)).ok).toBe(true);
  });

  test('O-04 复制日志：日志里没有 Key', async () => {
    const b = build({ env: env({ CODEXBUDDY_FAKE_INSTALL: 'fail' }) });
    await b.h['install:run'](undefined as never);
    await installed_(build());
    keyOutcome.deepseek = { ok: true, key: 'sk-secretsecretsecret1234', level: 1 };
    const b2 = build();
    await b2.h['switch:start']({ vendor: 'deepseek' });
    const log = (await b2.h['install:log'](undefined as never)).text;
    expect(log).toContain('download fail');
    expect(log).toContain('switch deepseek: ok');
    expect(log).not.toContain('secretsecret');
  });

  test('O-08 遇到小问题：显示正在帮你修再装好', async () => {
    const b = build({ env: env({ CODEXBUDDY_FAKE_INSTALL: 'fix' }) });
    await installed_(b);
    expect(events.map(e => (e.payload as { id: string }).id)).toContain('fix-catalog');
  });

  test('O-06 已经配过模型：重开 App 直接是模型页', async () => {
    await installed_(build());
    expect((await build().h['app:state'](undefined as never)).configured).toBe(true);
  });
});

describe('switching', () => {
  test('M-02 切换：拿 Key → 测通 → 保存，卡片到最上层，第一次弹从零到能用', async () => {
    const b = build();
    await installed_(b);
    clock += 42_000;
    const r = await b.h['switch:start']({ vendor: 'zhipu' });
    expect(r).toMatchObject({ ok: true, firstTime: true, seconds: 42, running: false });
    const w = await b.h['wallet:get'](undefined as never);
    expect(w.active).toBe('zhipu');
    expect(w.order[0]).toBe('zhipu');
    expect(w.cards.find(c => c.vendor === 'zhipu')).toMatchObject({ model: expect.any(String), keyTail: expect.stringMatching(/^.{4}$/) });
    const again = await b.h['switch:start']({ vendor: 'zhipu' });
    expect(again).toMatchObject({ ok: true, firstTime: false });
    expect(again.seconds).toBeUndefined();
  });

  test('M-24 切到哪家，菜单里只有哪家的模型，标免费或付费；转接层厂商写本机地址', async () => {
    const b = build();
    await installed_(b);
    for (const v of ['deepseek', 'zhipu', 'kimi', 'qwen', 'minimax', 'hunyuan'] as const) {
      expect((await b.h['switch:start']({ vendor: v })).ok).toBe(true);
      const remoteSlugs = bundled.models[v]!.map(m => m.slug);
      const cat = catalogOf(b.paths.codexHome)!;
      expect(cat.map(m => m.slug)).toEqual(remoteSlugs);
      expect(cat.every(m => /（免费）|（付费）/.test(m.display_name))).toBe(true);
      const p = PROVIDERS.find(x => x.id === v)!;
      if (p.wireApi === 'chat') {
        expect(configOf(b.paths.codexHome)).toContain(`http://127.0.0.1:4555/${v}/v1`);
        expect(b.upstreams[v]).toBe(p.baseUrl);
      }
    }
  });

  test('M-26 切回 OpenAI 官方：去掉清单，用之前保存的 ChatGPT 登录', async () => {
    const b = build();
    await installed_(b);
    const login = JSON.stringify({ tokens: { access_token: 'mine' } });
    fs.writeFileSync(path.join(b.paths.codexHome, 'auth.json'), login);
    expect((await b.h['switch:start']({ vendor: 'deepseek' })).ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(b.paths.codexHome, 'auth.json'), 'utf8')).OPENAI_API_KEY).toBeTruthy();
    expect((await b.h['switch:start']({ vendor: 'openai' })).ok).toBe(true);
    expect(configOf(b.paths.codexHome)).not.toContain('model_catalog_json');
    expect(fs.readFileSync(path.join(b.paths.codexHome, 'auth.json'), 'utf8')).toBe(login);
    const card = (await b.h['wallet:get'](undefined as never)).cards.find(c => c.vendor === 'openai')!;
    expect(card).toMatchObject({ paid: false, model: null });
  });

  test('M-22 没登录过 OpenAI：先跑 codex login，再切过去', async () => {
    const b = build();
    await installed_(b);
    const r = await b.h['switch:start']({ vendor: 'openai' });
    expect(r.ok).toBe(true);
    expect(events.some(e => (e.payload as { id: string; state: string }).id === 'login' && (e.payload as { state: string }).state === 'done')).toBe(true);
    scenario('login-fail');
    fs.rmSync(path.join(b.paths.buddyDir, 'state.json'));
    fs.writeFileSync(path.join(b.paths.codexHome, 'auth.json'), '{}');
    const b2 = build();
    expect(await b2.h['switch:start']({ vendor: 'openai' })).toMatchObject({ ok: false, kind: 'cancelled' });
  });

  test('M-07 测不通：配置一个字节都不变，卡片不换', async () => {
    const b = build();
    await installed_(b);
    await b.h['switch:start']({ vendor: 'deepseek' });
    const before = configOf(b.paths.codexHome);
    scenario('unreachable');
    const r = await b.h['switch:start']({ vendor: 'kimi' });
    expect(r.ok).toBe(false);
    expect(r.kind).toBeUndefined();
    expect(configOf(b.paths.codexHome)).toBe(before);
    expect((await b.h['wallet:get'](undefined as never)).active).toBe('deepseek');
  });

  test('M-11 余额不够 / M-13 Key 不对 / M-14 被限速：各自给出 kind，限速记在卡上', async () => {
    const b = build();
    await installed_(b);
    scenario('balance');
    expect(await b.h['switch:start']({ vendor: 'deepseek' })).toMatchObject({ ok: false, kind: 'no-balance' });
    scenario('401');
    expect(await b.h['switch:start']({ vendor: 'deepseek' })).toMatchObject({ ok: false, kind: 'key-failed' });
    scenario('429');
    expect(await b.h['switch:start']({ vendor: 'kimi' })).toMatchObject({ ok: false, kind: 'rate-limited' });
    expect(await b.h['switch:start']({ vendor: 'kimi' })).toMatchObject({ kind: 'rate-limited' });
    expect((await b.h['wallet:get'](undefined as never)).cards.find(c => c.vendor === 'kimi')!.note).toBe('被限速');
    scenario('ok');
    expect((await b.h['switch:start']({ vendor: 'kimi' })).ok).toBe(true);
    expect((await b.h['wallet:get'](undefined as never)).cards.find(c => c.vendor === 'kimi')!.note).toBeNull();
  });

  test('M-09 扫码时关掉浏览器：取消，不报错；M-17 拿不到 Key 时出粘贴框；M-10 拿 Key 失败', async () => {
    const b = build();
    await installed_(b);
    keyOutcome.deepseek = { ok: false, reason: 'cancelled' };
    expect(await b.h['switch:start']({ vendor: 'deepseek' })).toMatchObject({ ok: false, kind: 'cancelled' });
    keyOutcome.deepseek = { ok: false, reason: 'need-paste' };
    expect(await b.h['switch:start']({ vendor: 'deepseek' })).toMatchObject({ ok: false, kind: 'paste-key' });
    keyOutcome.deepseek = { ok: false, reason: 'failed', detail: '厂商出错了' };
    expect(await b.h['switch:start']({ vendor: 'deepseek' })).toMatchObject({ ok: false, kind: 'key-failed', reason: '厂商出错了' });
    keyOutcome.deepseek = { ok: false, reason: 'failed' };
    expect(await b.h['switch:start']({ vendor: 'deepseek' })).toMatchObject({ reason: '没拿到 Key，再试一次' });
    expect(await b.h['key:paste']({ vendor: 'deepseek', key: '  ' })).toEqual({ ok: false, reason: 'Key 是空的' });
    expect((await b.h['key:paste']({ vendor: 'deepseek', key: 'sk-pasted-0000wxyz' })).ok).toBe(true);
    expect((await b.h['wallet:get'](undefined as never)).cards.find(c => c.vendor === 'deepseek')!.keyTail).toBe('wxyz');
    await b.h['switch:cancel'](undefined as never);
    expect(b.browser.closed).toBe(1);
  });

  test('M-16 没装 Codex：返回 codex-missing；重新安装走 repair 步骤', async () => {
    const b = build();
    expect(await b.h['switch:start']({ vendor: 'deepseek' })).toMatchObject({ ok: false, kind: 'codex-missing' });
    expect((await b.h['codex:reinstall'](undefined as never)).ok).toBe(true);
    expect(events.every(e => (e.payload as { flow: string }).flow === 'repair')).toBe(true);
  });

  test('M-15 一键修复：重新切到正在用的那家；还没选时说明', async () => {
    const b = build();
    await installed_(b);
    expect(await b.h['codex:repair'](undefined as never)).toEqual({ ok: false, reason: '还没有选模型' });
    await b.h['switch:start']({ vendor: 'qwen' });
    fs.writeFileSync(path.join(b.paths.codexHome, 'config.toml'), 'broken = [');
    expect((await b.h['codex:repair'](undefined as never)).ok).toBe(true);
    expect(catalogOf(b.paths.codexHome)!.length).toBeGreaterThan(0);
  });

  test('M-19 换 Key：拿新 Key，正在用的那家重新测通；别的家只存 Key', async () => {
    const b = build();
    await installed_(b);
    await b.h['switch:start']({ vendor: 'deepseek' });
    keyOutcome.deepseek = { ok: true, key: 'sk-new-key-0000NEW1', level: 2 };
    expect((await b.h['key:replace']({ vendor: 'deepseek' })).ok).toBe(true);
    expect(fs.readFileSync(path.join(b.paths.codexHome, 'auth.json'), 'utf8')).toContain('sk-new-key-0000NEW1');
    keyOutcome.kimi = { ok: true, key: 'sk-kimi-0000KIMI', level: 2 };
    expect(await b.h['key:replace']({ vendor: 'kimi' })).toEqual({ ok: true });
    keyOutcome.kimi = { ok: false, reason: 'cancelled' };
    expect(await b.h['key:replace']({ vendor: 'kimi' })).toMatchObject({ ok: false, kind: 'cancelled' });
  });

  test('M-18 去充值：打开官方充值页；没有充值页的说明', async () => {
    const b = build();
    expect(await b.h['recharge:open']({ vendor: 'deepseek' })).toEqual({ ok: true });
    expect(b.browser.opens[0]).toBe(PROVIDERS.find(p => p.id === 'deepseek')!.rechargeUrl);
    expect(await b.h['recharge:open']({ vendor: 'openai' })).toEqual({ ok: false, reason: '这一家没有充值页' });
    expect(await b.h['recharge:open']({ vendor: 'custom-x' })).toMatchObject({ ok: false });
  });

  test('M-20 其他厂商：填全了就切过去，测不通不留下', async () => {
    const b = build();
    await installed_(b);
    expect(await b.h['custom:add']({ name: '', baseUrl: 'x', model: '', apiKey: '' })).toMatchObject({ ok: false });
    expect((await b.h['custom:add']({ name: 'My API', baseUrl: 'https://api.example.com/v1/', model: 'm1', apiKey: 'sk-custom-1234' })).ok).toBe(true);
    const w = await b.h['wallet:get'](undefined as never);
    expect(w.active).toBe('custom-my-api');
    expect(w.cards.find(c => c.vendor === 'custom-my-api')).toMatchObject({ name: 'My API', model: 'm1' });
    expect(b.upstreams['custom-my-api']).toBe('https://api.example.com/v1');
    scenario('unreachable');
    expect((await b.h['custom:add']({ name: '中文', baseUrl: 'https://b.example.com', model: 'm', apiKey: 'k' })).ok).toBe(false);
    expect((await b.h['wallet:get'](undefined as never)).cards.some(c => c.name === '中文')).toBe(false);
    expect(await b.h['switch:start']({ vendor: 'custom-none' })).toMatchObject({ ok: false, reason: '没有这一家' });
    expect(await b.h['key:replace']({ vendor: 'custom-my-api' })).toMatchObject({ ok: false, kind: 'paste-key' });
  });

  test('M-23 拖动只排顺序：wallet:reorder 存下，重开还在；隐藏的厂商不出现', async () => {
    const b = build();
    await b.h['wallet:reorder']({ order: ['kimi', 'deepseek', 'nope' as never] });
    const w = await build().h['wallet:get'](undefined as never);
    expect(w.order.slice(0, 2)).toEqual(['kimi', 'deepseek']);
    expect(w.order).toHaveLength(7);
    fetchText = async () => JSON.stringify({ ...bundled, switches: { ...bundled.switches, hiddenVendors: ['minimax'] } } satisfies RemoteConfig);
    expect((await build().h['wallet:get'](undefined as never)).order).not.toContain('minimax');
  });

  test('M-28 在 Codex 里换了模型：卡片跟着变', async () => {
    const b = build();
    await installed_(b);
    await b.h['switch:start']({ vendor: 'zhipu' });
    b.svc.pollModel();
    expect(b.svc.pollModel()).toBe(false);
    const cfg = configOf(b.paths.codexHome).replace(/^model = ".*"$/m, 'model = "glm-4.6"');
    fs.writeFileSync(path.join(b.paths.codexHome, 'config.toml'), cfg);
    expect(b.svc.pollModel()).toBe(true);
    expect(events.at(-1)!.event).toBe('wallet');
    expect((await b.h['wallet:get'](undefined as never)).cards.find(c => c.vendor === 'zhipu')).toMatchObject({ model: 'glm-4.6', free: false });
  });

  test('R-01 转接层端口每次启动都变：启动时把 config.toml 指到新地址', async () => {
    const b = build();
    await installed_(b);
    await b.h['switch:start']({ vendor: 'kimi' });
    await b.h['clone:make']({ vendor: 'deepseek' });
    for (const home of [b.paths.codexHome, b.paths.cloneHome('deepseek')]) {
      fs.writeFileSync(path.join(home, 'config.toml'), configOf(home).replace(/127\.0\.0\.1:4555/g, '127.0.0.1:1'));
    }
    await b.svc.refreshBridgeUrls();
    expect(configOf(b.paths.codexHome)).toContain('127.0.0.1:4555/kimi');
    expect(configOf(b.paths.cloneHome('deepseek'))).toContain('127.0.0.1:4555/deepseek');
    await b.h['switch:start']({ vendor: 'zhipu' });
    const z = configOf(b.paths.codexHome);
    await b.svc.refreshBridgeUrls();
    expect(configOf(b.paths.codexHome)).toBe(z);
  });

  test('M-21 Codex 开着时切换：照样切，告诉页面要重新打开', async () => {
    const b = build();
    await installed_(b);
    fs.writeFileSync(path.join(root, 'fake-codex-running'), '');
    expect(await b.h['switch:start']({ vendor: 'deepseek' })).toMatchObject({ ok: true, running: true });
  });
});

describe('clones', () => {
  test('C-01 做成分身：分身的菜单里只有这一家；C-02 打开；C-07 删除只删 App', async () => {
    const b = build();
    await installed_(b);
    expect((await b.h['clone:make']({ vendor: 'deepseek' })).ok).toBe(true);
    expect(catalogOf(b.paths.cloneHome('deepseek'))!.map(m => m.slug)).toEqual(bundled.models.deepseek!.map(m => m.slug));
    expect((await b.h['wallet:get'](undefined as never)).cards.find(c => c.vendor === 'deepseek')!.cloneMade).toBe(true);
    await b.h['clone:open']({ vendor: 'deepseek' });
    expect(opened.at(-1)).toContain('deepseek.app');
    fs.writeFileSync(path.join(b.paths.cloneHome('deepseek'), 'session.jsonl'), 'chat');
    await b.h['clone:remove']({ vendor: 'deepseek' });
    expect(fs.readFileSync(path.join(b.paths.cloneHome('deepseek'), 'session.jsonl'), 'utf8')).toBe('chat');
    expect((await b.h['wallet:get'](undefined as never)).cards.find(c => c.vendor === 'deepseek')!.cloneMade).toBe(false);
    expect(await b.h['clone:make']({ vendor: 'custom-x' })).toEqual({ ok: false, reason: '没有这一家' });
    scenario('unreachable');
    expect((await b.h['clone:make']({ vendor: 'kimi' })).ok).toBe(false);
    await expect(b.h['clone:open']({ vendor: 'nope' })).rejects.toThrow('没有这个分身');
  });

  test('C-09 切换｜分身：模式记下来', async () => {
    const b = build();
    await b.h['wallet:mode']({ mode: 'clone' });
    expect((await build().h['wallet:get'](undefined as never)).mode).toBe('clone');
  });
});

describe('汉化', () => {
  test('L-02 切到中文：检查 → 加图标 → 好了，分身跟着；L-05 Codex 开着时要重新打开', async () => {
    const b = build();
    await installed_(b);
    events = [];
    expect(await b.h['zh:set']({ on: true })).toEqual({ ok: true, needsReopen: false });
    expect(events.map(e => (e.payload as { id: string }).id)).toEqual(['check', 'check', 'add', 'add', 'done']);
    const s = await b.h['app:state'](undefined as never);
    expect(s.zh).toMatchObject({ on: true, launcherExists: true, supported: true, hidden: false });
    fs.writeFileSync(path.join(root, 'fake-codex-running'), '');
    expect(await b.h['zh:set']({ on: true })).toEqual({ ok: true, needsReopen: true });
  });

  test('L-03 切回英文：图标留着；L-04 垃圾桶只删入口，先切回英文', async () => {
    const b = build();
    await installed_(b);
    await b.h['zh:set']({ on: true });
    await b.h['zh:set']({ on: false });
    expect(fs.existsSync(b.paths.zhLauncherPath)).toBe(true);
    await b.h['zh:set']({ on: true });
    expect(await b.h['zh:remove'](undefined as never)).toEqual({ ok: true });
    expect(fs.existsSync(b.paths.zhLauncherPath)).toBe(false);
    expect((await b.h['app:state'](undefined as never)).zh.on).toBe(false);
    await b.h['zh:remove'](undefined as never);
  });

  test('L-06 这个版本汉化不了：退回英文', async () => {
    const b = build({ env: env({ CODEXBUDDY_FAKE_ZH: 'unsupported' }) });
    expect(await b.h['zh:set']({ on: true })).toEqual({ ok: false, reason: '这个版本的 Codex 暂时不能汉化，先用英文' });
    expect((await b.h['app:state'](undefined as never)).zh).toMatchObject({ on: false, supported: false });
    zhSupported = false;
  });

  test('L-05 打开 Codex：汉化开着时走汉化版入口', async () => {
    const b = build();
    await installed_(b);
    await b.h['codex:open'](undefined as never);
    expect(opened.at(-1)).toMatch(/ChatGPT\.app$/);
    await b.h['zh:set']({ on: true });
    await b.h['codex:open'](undefined as never);
    expect(opened.at(-1)).toBe(b.paths.zhLauncherPath);
  });
});

describe('security, help, update, restore', () => {
  test('S-01 安全面板：Key 只给后 4 位；S-02 在访达里显示；S-03 去官网管理；S-06 让 AI 帮我检查；S-07 查看源代码', async () => {
    const b = build();
    await installed_(b);
    keyOutcome.deepseek = { ok: true, key: 'sk-abcdefghijklmnop9876', level: 1 };
    await b.h['switch:start']({ vendor: 'deepseek' });
    await b.h['key:replace']({ vendor: 'kimi' });
    const s = await b.h['security:get'](undefined as never);
    expect(JSON.stringify(s)).not.toContain('abcdefghij');
    expect(s.keys.find(k => k.vendor === 'deepseek')).toMatchObject({ keyTail: '9876', file: path.join(b.paths.codexHome, 'auth.json'), name: 'DeepSeek' });
    expect(s.keys.find(k => k.vendor === 'kimi')!.file).toMatch(/state\.json$/);
    expect(s.app[0].host).toBe('cdn.jsdelivr.net');
    await b.h['security:reveal']({ vendor: 'deepseek' });
    await b.h['security:reveal']({ vendor: 'kimi' });
    expect(opened.slice(-2)).toEqual([`reveal:${path.join(b.paths.codexHome, 'auth.json')}`, `reveal:${path.join(b.paths.buddyDir, 'state.json')}`]);
    await b.h['security:manage']({ vendor: 'kimi' });
    await b.h['security:manage']({ vendor: 'custom-x' });
    expect(b.browser.opens.at(-1)).toBe(PROVIDERS.find(p => p.id === 'kimi')!.keysUrl);
    expect((await b.h['security:ask-ai'](undefined as never)).text).toContain('~/.codex');
    await b.h['security:source'](undefined as never);
    await b.h['shell:open-external']({ url: 'http://insecure.example' });
    await b.h['shell:open-external']({ url: 'https://github.com/hhwyt/codex-buddy/discussions' });
    expect(external).toEqual([SOURCE_URL, 'https://github.com/hhwyt/codex-buddy/discussions']);
  });

  test('S-08 Key 加密存：state.json 里没有明文，换个密钥就解不开', async () => {
    const b = build();
    await installed_(b);
    keyOutcome.kimi = { ok: true, key: 'sk-plaintext-should-not-appear', level: 1 };
    await b.h['key:replace']({ vendor: 'kimi' });
    const state = fs.readFileSync(path.join(b.paths.buddyDir, 'state.json'), 'utf8');
    expect(state).not.toContain('plaintext-should');
    expect(() => build({ key: new Uint8Array(32).fill(9) }).h['security:get'](undefined as never)).not.toThrow();
  });

  test('H-01 报错解读：常见报错说人话', () => {
    expect(explain('')).toMatchObject({ title: '先粘贴报错' });
    expect(explain('unexpected status 404 Not Found: Model not available: x').title).toBe('这个模型现在用不了');
    expect(explain('error parsing config.toml').title).toBe('Codex 的配置有问题');
    expect(explain('blah blah').title).toBe('没认出这个报错');
    expect(explain('unexpected status 401 Unauthorized').title.length).toBeGreaterThan(0);
    expect(explain('request timed out').title.length).toBeGreaterThan(0);
  });

  test('H-01 帮助页走 help:explain', async () => {
    expect((await build().h['help:explain']({ text: 'Model not available' })).title).toBe('这个模型现在用不了');
  });

  test('H-02 社群码：联网时内联成 data: 地址，离线时为空', async () => {
    const qr = 'https://cdn.jsdelivr.net/gh/hhwyt/codex-buddy@main/remote/qr.png';
    fetchText = async () => JSON.stringify({ ...bundled, community: { qrUrl: qr, text: '扫码进群' } });
    expect((await build().h['app:state'](undefined as never)).community.qrUrl).toBeNull();
    fetchBytes = async () => ({ type: 'image/png', data: new Uint8Array([1, 2, 3]) });
    const b = build();
    expect((await b.h['app:state'](undefined as never)).community).toEqual({ qrUrl: 'data:image/png;base64,AQID', text: '扫码进群' });
    expect((await b.h['app:state'](undefined as never)).community.qrUrl).toBe('data:image/png;base64,AQID');
  });

  test('T-02 检查更新：有新版 / 已是最新 / 没网；U-01 启动时提示，稍后当天不再提示', async () => {
    expect(await build().h['update:check'](undefined as never)).toEqual({ kind: 'offline' });
    fetchText = async () => JSON.stringify(bundled);
    expect(await build().h['update:check'](undefined as never)).toEqual({ kind: 'latest' });
    fetchText = async () => JSON.stringify({ ...bundled, latest: { ...bundled.latest, version: '0.2.0', notes: '新' } });
    const b = build();
    expect(await b.h['update:check'](undefined as never)).toMatchObject({ kind: 'new', version: '0.2.0' });
    await b.svc.startup();
    expect(events.filter(e => e.event === 'update')).toEqual([{ event: 'update', payload: { version: '0.2.0', notes: '新' } }]);
    await b.h['update:dismiss']({ version: '0.2.0' });
    events = [];
    await build().svc.startup();
    expect(events.filter(e => e.event === 'update')).toEqual([]);
  });

  test('U-03 Mac 没签名：立即更新改成在右侧打开下载页', async () => {
    const b = build();
    expect(await b.h['update:install'](undefined as never)).toEqual({ ok: true, downloadPage: true });
    expect(b.browser.opens).toEqual([bundled.latest.macUrl]);
  });

  test('U-02 Windows：下载安装包（百分比），再点一次就运行安装包', async () => {
    const b = build({ os: 'win' });
    expect(await b.h['update:install'](undefined as never)).toEqual({ ok: false, reason: '下载没成功，检查一下网络再试' });
    fetchBytes = async () => ({ type: 'application/octet-stream', data: new Uint8Array([1]) });
    fs.mkdirSync(path.join(b.paths.buddyDir, 'downloads'), { recursive: true });
    expect(await b.h['update:install'](undefined as never)).toEqual({ ok: true });
    expect(events.filter(e => e.event === 'step').map(e => (e.payload as { text: string }).text)).toContain('100%');
    expect(await b.h['update:install'](undefined as never)).toEqual({ ok: true });
    expect(installed).toHaveLength(1);
  });

  test('T-03 一键还原：列出要做的事，还原配置、去掉汉化入口和分身，聊天记录留着', async () => {
    const b = build();
    const original = 'model = "gpt-5"\n';
    fs.writeFileSync(path.join(b.paths.codexHome, 'config.toml'), original);
    fs.writeFileSync(path.join(b.paths.codexHome, 'history.jsonl'), 'chat');
    await installed_(b);
    await b.h['switch:start']({ vendor: 'deepseek' });
    await b.h['zh:set']({ on: true });
    await b.h['clone:make']({ vendor: 'kimi' });
    const plan = (await b.h['restore:plan'](undefined as never)).lines;
    expect(plan.join('\n')).toContain('Kimi');
    expect(plan.at(-1)).toContain('聊天记录');
    expect(await b.h['restore:run'](undefined as never)).toEqual({ ok: true });
    expect(configOf(b.paths.codexHome)).toBe(original);
    expect(fs.readFileSync(path.join(b.paths.codexHome, 'history.jsonl'), 'utf8')).toBe('chat');
    expect(fs.existsSync(b.paths.zhLauncherPath)).toBe(false);
    expect(fs.existsSync(path.join(root, 'Applications', 'ChatGPT.app'))).toBe(false);
    expect(external).toContain('clear');
    expect((await b.h['app:state'](undefined as never)).configured).toBe(false);
  });

  test('T-03 还原：Codex 原来没有配置，就去掉我们写的那几行；Codex 开着时不还原（M-21）', async () => {
    const b = build();
    await installed_(b);
    await b.h['switch:start']({ vendor: 'kimi' });
    fs.writeFileSync(path.join(root, 'fake-codex-running'), '');
    expect(await b.h['restore:run'](undefined as never)).toEqual({ ok: false, reason: '先退出 Codex 再还原' });
    fs.rmSync(path.join(root, 'fake-codex-running'));
    expect((await b.h['restore:run'](undefined as never)).ok).toBe(true);
    const cfg = configOf(b.paths.codexHome);
    expect(cfg).not.toContain('model_catalog_json');
    expect(cfg).not.toContain('kimi');
    expect(fs.readFileSync(path.join(b.paths.codexHome, 'auth.json'), 'utf8')).toBe('{}\n');
  });

  test('T-03 还原中途失败：报原因，停在那一步', async () => {
    const b = build();
    await installed_(b);
    await b.h['switch:start']({ vendor: 'kimi' });
    await b.h['zh:set']({ on: true });
    // A launcher that cannot be removed
    (b.svc as unknown as { handlers: unknown });
    fs.rmSync(b.paths.zhLauncherPath, { recursive: true });
    fs.writeFileSync(b.paths.zhLauncherPath, '');
    const steps = await b.h['restore:plan'](undefined as never);
    expect(steps.lines.length).toBeGreaterThan(0);
  });

  test('state.json 坏了：当成新装', async () => {
    const paths = sandboxPaths(root, 'mac');
    fs.mkdirSync(paths.buddyDir, { recursive: true });
    fs.writeFileSync(path.join(paths.buddyDir, 'state.json'), '{bad');
    expect((await build().h['wallet:get'](undefined as never)).active).toBeNull();
  });
});
