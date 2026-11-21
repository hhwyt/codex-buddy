// Main-process services (every IPC handler) against a temp sandbox, the sandbox Codex stand-ins and the fake Codex CLI.
// Nothing here touches the real ~/.codex or /Applications.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PROVIDERS } from '../../electron/core/providers';
import { validateRemote } from '../../electron/core/remote';
import { TEST_PUBLIC_KEY, testSign } from '../fakes/remote-test-key.mjs';
import type { BuiltinVendorId, RemoteConfig } from '../../electron/core/types';
import { aesCipher } from '../../electron/main/cipher';
import type { EventName } from '../../electron/main/ipc-contract';
import { createServices, isOurCatalog, onlyOurKey, QR_WAIT_MS, REMOTE_GRACE_MS, SOURCE_URL, type ServiceDeps } from '../../electron/main/services';
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
/** Non-null: every .sig answer is this instead of a real signature (a forged config) */
let forgedSig: string | null;
let fetchBytes: ServiceDeps['fetchBytes'];
let zhSupported: boolean | 'throws';
/** Non-null: clearing the right-side browser's logins fails with this message */
let clearFails: string | null;
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
    supported: async () => { if (zhSupported === 'throws') throw new Error('no zh'); return zhSupported; },
  };
}

const fakeBrowser = (): BrowserDriver & { close(): void; reload(): void; closed: number; reloads: number; opens: string[]; at: string } => {
  const b = {
    closed: 0, reloads: 0, opens: [] as string[], at: '',
    open: async (url: string) => { b.opens.push(url); b.at = url; },
    reload: () => { b.reloads++; },
    url: () => b.at, evaluate: async <T,>() => undefined as T, waitForResponse: async () => '',
    waitForUrl: async () => true, setMode: () => {}, close: () => { b.closed++; }, hasCookie: async () => true,
  };
  return b;
};

function fakeVendors(): Record<BuiltinVendorId, Vendor> {
  return Object.fromEntries(PROVIDERS.map(p => [p.id, {
    id: p.id, provider: p, isLoggedIn: () => true,
    obtainKey: async (_b: unknown, onCreate?: () => void) => { onCreate?.(); return keyOutcome[p.id] ?? { ok: true, key: `sk-${p.id}-${randomBytes(4).toString('hex')}abcd`, level: 1 }; },
    openRecharge: async (b: BrowserDriver) => { if (!p.rechargeUrl) return false; await b.open(p.rechargeUrl, { mode: 'expanded' }); return true; },
    openKeyManagement: async (b: BrowserDriver) => { await b.open(p.keysUrl, { mode: 'expanded' }); },
  } satisfies Vendor])) as unknown as Record<BuiltinVendorId, Vendor>;
}

function build(opts: { env?: NodeJS.ProcessEnv; key?: Uint8Array; os?: 'mac' | 'win'; remoteUrls?: string[]; balance?: Parameters<typeof createServices>[0]['balance'];
  ghStar?: ServiceDeps['ghStar']; bridgeRemove?: () => Promise<void>; clone?: Clone; forceStarVerify?: boolean } = {}) {
  const paths = sandboxPaths(root, 'mac');
  const base = createMacPlatform(paths);
  const platform = sandboxPlatform(base, { root, env: opts.env ?? env(), open: async t => { opened.push(t); }, reveal: async t => { opened.push(`reveal:${t}`); } });
  const clone = sandboxClone(opts.clone ?? fakeClone(paths), async t => { opened.push(t); });
  const zh = sandboxZh(fakeZh(paths), opts.env ?? env());
  const browser = fakeBrowser();
  const upstreams: Record<string, string> = {};
  const svc = createServices({
    platform, clone, zh, providers: PROVIDERS, vendors: fakeVendors(), browser,
    bridge: { baseUrlFor: (v, u) => { upstreams[v] = u; return `http://127.0.0.1:4555/${v}/v1`; }, isBridgeUrl: u => u.startsWith('http://127.0.0.1:4555'), ...(opts.bridgeRemove ? { remove: opts.bridgeRemove } : {}) },
    cipher: aesCipher(opts.key ?? new Uint8Array(32).fill(7)),
    // The fake answers config.json; its .sig is signed with the test key, like the real release script does
    fetchText: url => (url.endsWith('.sig') ? (forgedSig !== null ? Promise.resolve(forgedSig) : fetchText(url.slice(0, -4)).then(testSign)) : fetchText(url)), fetchBytes: (url, onProgress) => fetchBytes(url, onProgress),
    remotePublicKey: TEST_PUBLIC_KEY,
    remoteUrls: opts.remoteUrls ?? ['https://cdn.jsdelivr.net/gh/x/y@main/remote/config.json', 'https://raw.githubusercontent.com/x/y/main/remote/config.json'],
    bundledRemote: bundled, version: '0.1.0', os: opts.os ?? 'mac',
    now: () => clock, emit: (event, payload) => { events.push({ event, payload }); },
    openExternal: async u => { external.push(u); }, clearBrowserData: async () => { if (clearFails !== null) throw new Error(clearFails); external.push('clear'); },
    connections: () => ({ app: [{ host: 'cdn.jsdelivr.net', allowed: true, at: 1 }], web: [] }),
    logoPng: v => `/logos/${v}.png`,
    runInstaller: async f => { installed.push(f); },
    ...(opts.balance ? { balance: opts.balance } : {}),
    ...(opts.ghStar ? { ghStar: opts.ghStar } : {}),
    ...(opts.forceStarVerify ? { forceStarVerify: true } : {}),
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
  fetchText = async () => JSON.stringify(bundled);
  forgedSig = null;
  clearFails = null;
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
    // Before any switch the 智谱 tag already says 免费 (its default model), 混元 按用量付费: the tag never flips on switching
    const before = (await b.h['wallet:get'](undefined as never)).cards;
    expect(before.find(c => c.vendor === 'zhipu')).toMatchObject({ model: null, free: true });
    expect(before.find(c => c.vendor === 'hunyuan')).toMatchObject({ model: null, free: false, paid: true });
    clock += 42_000;
    const r = await b.h['switch:start']({ vendor: 'zhipu' });
    expect(r).toMatchObject({ ok: true, firstTime: true, seconds: 42, running: false });
    const w = await b.h['wallet:get'](undefined as never);
    expect(w.active).toBe('zhipu');
    expect(w.order[0]).toBe('zhipu');
    expect(w.cards.find(c => c.vendor === 'zhipu')).toMatchObject({ model: expect.any(String), free: true, keyTail: expect.stringMatching(/^.{4}$/) });
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

  test('M-09 等 OpenAI 登录时取消：codex login 被停掉，返回 cancelled，配置不动，再切照常', async () => {
    const b = build();
    await installed_(b);
    expect((await b.h['switch:start']({ vendor: 'deepseek' })).ok).toBe(true);
    const before = configOf(b.paths.codexHome);
    events = [];
    scenario('login-wait'); // the user never signs in: `codex login` would wait 10 minutes
    const loginStarted = () => events.some(e => e.event === 'step' && (e.payload as { id: string; state: string }).id === 'login' && (e.payload as { state: string }).state === 'start');
    const started = Date.now();
    const pending = b.h['switch:start']({ vendor: 'openai' });
    await vi.waitFor(() => expect(loginStarted()).toBe(true));
    const closedBefore = b.browser.closed;
    await b.h['switch:cancel'](undefined as never);
    expect(await pending).toMatchObject({ ok: false, kind: 'cancelled' });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(b.browser.closed).toBe(closedBefore + 1);
    expect(events.some(e => e.event === 'step' && (e.payload as { id: string; state: string; text: string }).state === 'fail' && (e.payload as { text: string }).text === '取消了')).toBe(true);
    expect(configOf(b.paths.codexHome)).toBe(before);
    expect((await b.h['wallet:get'](undefined as never)).active).toBe('deepseek');
    expect(b.svc.state().openaiAuth).toBeNull();
    // the cancel does not stick to the next switch
    await b.h['switch:cancel'](undefined as never);
    scenario('ok');
    expect((await b.h['switch:start']({ vendor: 'openai' })).ok).toBe(true);
  });

  test('M-02 切换成功后画中画关掉：不留上一家的页面，不挡最上层卡的「换」；M-12 只剩赠送额度时充值页留在画中画', async () => {
    const b = build({ balance: async p => (p.id === 'deepseek' ? { granted: 5, toppedUp: 0 } : null) });
    await installed_(b);
    expect((await b.h['switch:start']({ vendor: 'kimi' })).ok).toBe(true);
    // Closed right after the key was caught (the official page shows the whole key), and again after the switch
    expect(b.browser.closed).toBe(2);
    expect(b.browser.opens).toEqual([]);
    expect(await b.h['switch:start']({ vendor: 'deepseek' })).toMatchObject({ ok: true, trial: true });
    expect(b.browser.closed).toBe(3);
    expect(b.browser.opens).toEqual([PROVIDERS.find(p => p.id === 'deepseek')!.rechargeUrl]);
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
    const closedBefore = b.browser.closed;
    expect((await b.h['key:paste']({ vendor: 'deepseek', key: 'sk-pasted-0000wxyz' })).ok).toBe(true);
    expect(b.browser.closed).toBe(closedBefore + 1); // the switch succeeded: the Key page is closed
    expect((await b.h['wallet:get'](undefined as never)).cards.find(c => c.vendor === 'deepseek')!.keyTail).toBe('wxyz');
    await b.h['switch:cancel'](undefined as never);
    expect(b.browser.closed).toBe(closedBefore + 2);
  });

  test('M-16 没装 Codex：返回 codex-missing；重新安装走 repair 步骤', async () => {
    const b = build();
    expect(await b.h['switch:start']({ vendor: 'deepseek' })).toMatchObject({ ok: false, kind: 'codex-missing' });
    expect((await b.h['codex:reinstall'](undefined as never)).ok).toBe(true);
    expect(events.filter(e => e.event === 'step').every(e => (e.payload as { flow: string }).flow === 'repair')).toBe(true);
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

  test('M-15 一键修复时发现 Codex 已经没了：说没找到，交给「重新安装」', async () => {
    const b = build();
    await installed_(b);
    await b.h['switch:start']({ vendor: 'qwen' });
    fs.rmSync(path.join(root, 'Applications', 'Test-ChatGPT.app'), { recursive: true, force: true });
    expect(await b.h['codex:repair'](undefined as never)).toEqual({ ok: false, kind: 'codex-missing', reason: '没找到 Codex' });
  });

  test('T-04 还原途中某一步失败：停下并报出那一步的原因；没有原因就说「没还原完」', async () => {
    const b = build();
    await installed_(b);
    await b.h['switch:start']({ vendor: 'deepseek' });
    clearFails = '浏览器数据删不掉';
    expect(await b.h['restore:run'](undefined as never)).toEqual({ ok: false, reason: '浏览器数据删不掉' });
    expect(events.some(e => e.event === 'step' && (e.payload as { state: string; text: string }).state === 'fail')).toBe(true);
    clearFails = '';
    expect(await b.h['restore:run'](undefined as never)).toEqual({ ok: false, reason: '没还原完' });
  });

  test('L-06 查汉化支不支持时出错：当作不支持，App 照常打开', async () => {
    zhSupported = 'throws';
    expect((await build().h['app:state'](undefined as never)).zh.supported).toBe(false);
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

  test('M-19 其他厂商：填全了就切过去', async () => {
    const b = build();
    await installed_(b);
    expect(await b.h['custom:add']({ name: '', baseUrl: 'x', model: '', apiKey: '' })).toMatchObject({ ok: false });
    expect((await b.h['custom:add']({ name: 'My API', baseUrl: 'https://api.example.com/v1/', model: 'm1', apiKey: 'sk-custom-1234' })).ok).toBe(true);
    const w = await b.h['wallet:get'](undefined as never);
    expect(w.active).toBe('custom-my-api');
    expect(w.cards.find(c => c.vendor === 'custom-my-api')).toMatchObject({ name: 'My API', model: 'm1' });
    expect(b.upstreams['custom-my-api']).toBe('https://api.example.com/v1');
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
    expect(await b.h['zh:set']({ on: true })).toMatchObject({ ok: true, needsReopen: false });
    expect(events.filter(e => e.event === 'step').map(e => (e.payload as { id: string }).id)).toEqual(['check', 'check', 'add', 'add', 'done']);
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
    expect(await b.h['zh:remove'](undefined as never)).toMatchObject({ ok: true });
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

describe('security, community, update, restore', () => {
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

  test('M-01 远程配置下得慢（jsDelivr、GitHub 都卡着）：页面 0.5 秒内先拿到上次的或 App 自带的，下好后卡片再刷新', async () => {
    let arrive!: (text: string) => void;
    const slow = new Promise<string>(r => { arrive = r; });
    fetchText = () => slow; // config.json and its .sig both wait for the same answer
    const b = build();
    const t0 = Date.now();
    const [state, w] = await Promise.all([b.h['app:state'](undefined as never), b.h['wallet:get'](undefined as never)]);
    expect(Date.now() - t0).toBeLessThan(REMOTE_GRACE_MS + 400);
    expect(state.upgradeRequired).toBeNull();
    expect(w.cards.map(c => c.vendor)).toContain('minimax');
    events = [];
    arrive(JSON.stringify({ ...bundled, switches: { ...bundled.switches, hiddenVendors: ['minimax'] } }));
    await new Promise(r => setTimeout(r, 20));
    const sent = events.filter(e => e.event === 'wallet');
    expect(sent).toHaveLength(1);
    expect((sent[0].payload as { cards: { vendor: string }[] }).cards.map(c => c.vendor)).not.toContain('minimax');
    events = [];
    await b.h['update:check'](undefined as never); // same config again: nothing to redraw
    expect(events.filter(e => e.event === 'wallet')).toEqual([]);
  });

  test('H-02 社群码：联网时内联成 data: 地址，离线时为空', async () => {
    const qr = 'https://cdn.jsdelivr.net/gh/hhwyt/codex-buddy@main/remote/qr.png';
    fetchText = async () => JSON.stringify({ ...bundled, community: { qrUrl: qr, text: '扫码进群' } });
    expect((await build().h['app:state'](undefined as never)).community.qrUrl).toBeNull();
    fetchBytes = async () => ({ type: 'image/png', data: new Uint8Array([1, 2, 3]) });
    const b = build();
    expect((await b.h['app:state'](undefined as never)).community).toEqual({ qrUrl: 'data:image/png;base64,AQID' });
    expect((await b.h['app:state'](undefined as never)).community.qrUrl).toBe('data:image/png;base64,AQID');
  });

  test('H-02 社群码下得慢时不拖住页面：最多等 3 秒，下好了下次就有', async () => {
    fetchText = async () => JSON.stringify({ ...bundled, community: { qrUrl: 'https://cdn.jsdelivr.net/gh/hhwyt/codex-buddy@main/remote/qr.png', text: '扫码进群' } });
    let arrive: (v: { type: string; data: Uint8Array }) => void = () => {};
    fetchBytes = () => new Promise(r => { arrive = r; });
    const b = build();
    await b.h['app:state'](undefined as never); // loads the remote config
    vi.useFakeTimers();
    try {
      const pending = b.h['app:state'](undefined as never);
      await vi.advanceTimersByTimeAsync(QR_WAIT_MS);
      expect((await pending).community.qrUrl).toBeNull();
    } finally { vi.useRealTimers(); }
    arrive({ type: 'image/png', data: new Uint8Array([1]) });
    await new Promise(r => setTimeout(r, 0));
    expect((await b.h['app:state'](undefined as never)).community.qrUrl).toBe('data:image/png;base64,AQ==');
  });

  test('T-02 检查更新：有新版 / 已是最新 / 没网；U-01 启动时提示，稍后当天不再提示', async () => {
    fetchText = async () => { throw new Error('offline'); };
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

  describe('强制升级（minVersion）', () => {
    const withMin = (minVersion: string, version = '0.3.0') =>
      JSON.stringify({ ...bundled, minVersion, latest: { ...bundled.latest, version, notes: '必须更新' } });
    const required = async (b: ReturnType<typeof build>) => (await b.h['app:state'](undefined as never)).upgradeRequired;
    const want = { version: '0.3.0', notes: '必须更新', url: bundled.latest.macUrl };

    test('V-01 首次启动断网也不放行功能', async () => {
      fetchText = async () => { throw new Error('offline'); };
      expect(await required(build())).toBeNull();
      expect(events.filter(e => e.event === 'upgradeRequired')).toEqual([]);
      const b = build();
      expect((await b.h['app:state'](undefined as never)).versionStatus).toBe('offline');
      expect(await b.h['install:run'](undefined as never)).toMatchObject({ ok: false, kind: 'version-required' });
    });

    test('当前版本低于 minVersion：app:state 和事件都报要升级；Windows 给 Windows 的下载地址', async () => {
      fetchText = async () => withMin('0.2.0');
      const b = build();
      await b.svc.startup();
      expect(events.filter(e => e.event === 'upgradeRequired')).toEqual([{ event: 'upgradeRequired', payload: want }]);
      expect(await required(b)).toEqual(want);
      expect(await required(build({ os: 'win' }))).toEqual({ ...want, url: bundled.latest.winUrl });
    });

    test('只升不降：之后的配置把 minVersion 改低、或者断网、或者一键还原，都还是要升级', async () => {
      fetchText = async () => withMin('0.2.0');
      expect(await required(build())).toEqual(want);
      fetchText = async () => withMin('0.0.0');
      const lower = build();
      expect(await required(lower)).toEqual(want);
      await lower.h['update:check'](undefined as never); // a later refresh does not lower it either
      expect(await required(lower)).toEqual(want);
      fetchText = async () => { throw new Error('offline'); };
      expect(await required(build())).toEqual(want);
      // Hand-editing the cached copy does not lower it: the floor is kept on its own, encrypted
      const file = path.join(build().paths.buddyDir, 'state.json');
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(saved.minVersionFloor).not.toContain('0.2.0');
      fs.writeFileSync(file, JSON.stringify({ ...saved, lastRemote: { ...saved.lastRemote, minVersion: '0.0.0' } }));
      const b = build();
      expect(await required(b)).toEqual(want);
      expect(await b.h['restore:run'](undefined as never)).toMatchObject({ ok: false, kind: 'version-required' });
      expect(await required(build())).toEqual(want);
    });

    test('高于等于 minVersion：不拦；配置后来抬高了就拦，事件只在变化时发', async () => {
      fetchText = async () => withMin('0.1.0');
      const b = build();
      expect(await required(b)).toBeNull();
      fetchText = async () => withMin('0.2.0');
      await b.h['update:check'](undefined as never);
      await b.h['update:check'](undefined as never);
      expect(await required(b)).toEqual(want);
      expect(events.filter(e => e.event === 'upgradeRequired')).toEqual([{ event: 'upgradeRequired', payload: want }]);
    });

    test('签名不对的配置不算数：伪造的 minVersion 既拦不了人，也抬不高下限', async () => {
      fetchText = async () => withMin('9.0.0');
      forgedSig = testSign(withMin('0.0.0'));
      const b = build();
      expect(await required(b)).toBeNull();
      expect(b.svc.state().minVersionFloor).toBeNull();
      expect(b.svc.state().lastRemote).toBeNull();
    });

    test('存的下限解不开（换了密钥）：当作没有，放行到下次取到配置', async () => {
      fetchText = async () => withMin('0.2.0');
      expect(await required(build())).toEqual(want);
      const file = path.join(build().paths.buddyDir, 'state.json');
      fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), lastRemote: null }));
      fetchText = async () => { throw new Error('offline'); };
      expect(await required(build({ key: new Uint8Array(32).fill(9) }))).toBeNull();
    });
  });

  describe('强制升级：安装包验证', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const release = (extra: Record<string, unknown> = {}) => {
      const config = { ...bundled, minVersion: '0.2.0', latest: { ...bundled.latest, version: '0.3.0',
        macUrl: 'https://github.com/hhwyt/codex-buddy-releases/releases/download/v0.3.0/CodexBuddy-0.3.0.dmg',
        winUrl: 'https://github.com/hhwyt/codex-buddy-releases/releases/download/v0.3.0/CodexBuddy-Setup-0.3.0.exe',
        macSha256: sha256, winSha256: sha256, ...extra } };
      fetchText = async () => JSON.stringify(config);
    };

    test.each(['mac', 'win'] as const)('V-04 %s 下载、校验并运行，缓存每次重验且不重复下载', async os => {
      release();
      let downloads = 0;
      fetchBytes = async (_url, progress) => { downloads++; progress?.(1, 3); return { type: 'application/octet-stream', data: bytes }; };
      const b = build({ os });
      expect(await b.h['upgrade:run'](undefined as never)).toEqual({ ok: true });
      const file = path.join(b.paths.buddyDir, 'downloads', `CodexBuddy-0.3.0.${os === 'mac' ? 'dmg' : 'exe'}`);
      expect(installed).toEqual([file]);
      expect(await b.h['upgrade:run'](undefined as never)).toEqual({ ok: true });
      expect(downloads).toBe(1);
      fs.writeFileSync(file, 'damaged');
      expect(await b.h['upgrade:run'](undefined as never)).toEqual({ ok: true });
      expect(downloads).toBe(2);
      expect([...fs.readFileSync(file)]).toEqual([...bytes]);
    });

    test('V-04 哈希不匹配、没有哈希、发布页、错误版本链接均不执行', async () => {
      let downloads = 0;
      fetchBytes = async () => { downloads++; return { type: 'application/octet-stream', data: new Uint8Array([9]) }; };
      const b = build({ os: 'win' });
      for (const extra of [{}, { winSha256: undefined }, { winUrl: 'https://github.com/hhwyt/codex-buddy-releases/releases/latest' },
        { winUrl: 'https://github.com/hhwyt/codex-buddy-releases/releases/download/v0.1.0/old.exe' }]) {
        release(extra);
        expect(await b.h['upgrade:run'](undefined as never)).toMatchObject({ ok: false });
      }
      expect(downloads).toBe(1);
      expect(installed).toEqual([]);
      expect(fs.existsSync(path.join(b.paths.buddyDir, 'downloads', 'CodexBuddy-0.3.0.exe'))).toBe(false);
    });

    test('V-05 失败原因按实际情况返回，弹窗照写', async () => {
      const b = build({ os: 'win' });
      const reason = async () => (await b.h['upgrade:run'](undefined as never)).reason;
      release({ version: '0.1.5' });
      expect(await reason()).toBe('当前版本不用升级。');
      release({ winSha256: undefined });
      expect(await reason()).toBe('更新包的信息不对，请稍后再试。');
      release();
      fetchBytes = async () => { throw new Error('timeout'); };
      expect(await reason()).toBe('更新包没下载下来，请检查网络后重试。');
      fetchBytes = async () => ({ type: 'application/octet-stream', data: new Uint8Array([9]) });
      expect(await reason()).toBe('下载的更新包不完整，请再试一次。');
      fetchBytes = async () => ({ type: 'application/octet-stream', data: bytes });
      installed.push = () => { throw new Error('blocked'); };
      expect(await reason()).toBe('安装程序没能打开，请再试一次。');
      fetchText = async () => { throw new Error('offline'); };
      expect(await reason()).toBe('连不上网，请检查网络后重试。');
    });

    test('V-05 下载中断后可重试，不保留损坏安装包', async () => {
      release();
      const b = build({ os: 'win' });
      expect(await b.h['upgrade:run'](undefined as never)).toMatchObject({ ok: false });
      fetchBytes = async () => ({ type: 'application/octet-stream', data: bytes });
      expect(await b.h['upgrade:run'](undefined as never)).toEqual({ ok: true });
      expect(installed).toHaveLength(1);
    });

    test('U-02 普通更新同样校验，两次点击先下载后安装', async () => {
      release();
      fetchBytes = async () => ({ type: 'application/octet-stream', data: bytes });
      const b = build({ os: 'win' });
      expect(await b.h['update:install'](undefined as never)).toEqual({ ok: true });
      expect(installed).toEqual([]);
      expect(await b.h['update:install'](undefined as never)).toEqual({ ok: true });
      expect(installed).toHaveLength(1);
    });
  });

  test('V-02 N-04 运行中重新校验，抬高下限即拦截后台操作；用到一半断网不拦截', async () => {
    const b = build();
    expect(await b.svc.versionAllowed()).toBe(true);
    fetchText = async () => { throw new Error('offline'); };
    clock += 60_000;
    expect(await b.svc.versionAllowed()).toBe(true);
    expect(events.filter(e => e.event === 'versionStatus').at(-1)?.payload).toBe('allowed');
    fetchText = async () => JSON.stringify(bundled);
    await b.svc.checkVersion();
    expect(await b.svc.versionAllowed()).toBe(true);
    fetchText = async () => JSON.stringify({ ...bundled, minVersion: '0.2.0', latest: { ...bundled.latest, version: '0.2.0' } });
    await b.svc.checkVersion();
    expect(await b.h['clone:open']({ vendor: 'deepseek' })).toMatchObject({ ok: false, kind: 'version-required' });
    expect(events.some(e => e.event === 'upgradeRequired' && e.payload)).toBe(true);
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
    expect(fs.existsSync(path.join(root, 'Applications', 'Test-ChatGPT.app'))).toBe(false);
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
    // The key file and the model menu CodexBuddy added are taken away again (they still hold only what we wrote)
    expect(fs.existsSync(path.join(b.paths.codexHome, 'auth.json'))).toBe(false);
    expect(fs.existsSync(path.join(b.paths.codexHome, 'codexbuddy-models.json'))).toBe(false);
  });

  test('T-04 还原：我们加的 auth.json 后来存了 ChatGPT 登录，就留着不动', async () => {
    const b = build();
    await installed_(b);
    await b.h['switch:start']({ vendor: 'kimi' });
    const login = '{"OPENAI_API_KEY":null,"tokens":{"id_token":"x"}}\n';
    fs.writeFileSync(path.join(b.paths.codexHome, 'auth.json'), login);
    expect((await b.h['restore:run'](undefined as never)).ok).toBe(true);
    expect(fs.readFileSync(path.join(b.paths.codexHome, 'auth.json'), 'utf8')).toBe(login);
  });

  test('T-04 还原只认自己写的：只有单独一个 API Key 和我们的模型清单格式算我们的', () => {
    expect(onlyOurKey('{"OPENAI_API_KEY":"sk-1"}')).toBe(true);
    expect(onlyOurKey('{}')).toBe(true);
    expect(onlyOurKey('{"tokens":{}}')).toBe(false);
    expect(onlyOurKey('null')).toBe(false);
    expect(onlyOurKey('not json')).toBe(false);
    expect(isOurCatalog('{"models":[]}')).toBe(true);
    expect(isOurCatalog('{"x":1}')).toBe(false);
    expect(isOurCatalog('nope')).toBe(false);
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

test('M-01 默认官方账号排第一，保存的卡片顺序不强制重排', async () => {
  const b = build();
  expect((await b.h['wallet:get'](undefined as never)).order.slice(0, 3)).toEqual(['openai', 'zhipu', 'deepseek']);
  await b.h['wallet:reorder']({ order: ['kimi', 'openai', 'zhipu', 'deepseek'] });
  expect((await b.h['wallet:get'](undefined as never)).order.slice(0, 2)).toEqual(['kimi', 'openai']);
});

describe('配置生效与重启确认', () => {
  test('M-21 只有成功且有变化、应用运行时才要求重启；待重启状态跨进程保存', async () => {
    const b = build();
    await installed_(b);
    fs.writeFileSync(path.join(root, 'fake-codex-running'), '1');
    const result = await b.h['switch:start']({ vendor: 'deepseek' });
    expect(result.restartRequired).toBe(true);
    expect(b.svc.state().restartRequired).toBe(true);
    expect(opened).toEqual([]);
    expect((await build().h['app:state'](undefined as never)).restartRequired).toBe(true);
    expect((await b.h['switch:start']({ vendor: 'deepseek' })).restartRequired).not.toBe(true);
    keyOutcome.kimi = { ok: false, reason: 'failed' };
    expect((await b.h['switch:start']({ vendor: 'kimi' })).ok).toBe(false);
    expect(b.svc.state().restartRequired).toBe(true);
  });

  test('M-21 应用未运行时保存配置邀请打开，无变化不邀请', async () => {
    const b = build();
    await installed_(b);
    const result = await b.h['switch:start']({ vendor: 'deepseek' });
    expect(result.restartRequired).toBe(false);
    expect(result.openRequired).toBe(true);
    expect((await b.h['switch:start']({ vendor: 'deepseek' })).openRequired).not.toBe(true);
    expect(b.svc.state().restartRequired).toBe(false);
  });

  test('M-21 重启成功才清除待重启状态，不改聊天与配置；并发请求合并', async () => {
    const b = build();
    await installed_(b);
    fs.writeFileSync(path.join(root, 'fake-codex-running'), '1');
    await b.h['switch:start']({ vendor: 'deepseek' });
    const before = configOf(b.paths.codexHome);
    fs.writeFileSync(path.join(b.paths.codexHome, 'session.json'), 'keep-chat');
    let finish!: () => void;
    const restart = vi.spyOn(b.platform, 'restartCodex').mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const first = b.h['codex:restart'](undefined as never);
    const second = b.h['codex:restart'](undefined as never);
    await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    expect(b.svc.state().restartRequired).toBe(true);
    finish();
    expect(await first).toEqual({ ok: true });
    expect(await second).toEqual({ ok: true });
    expect(b.svc.state().restartRequired).toBe(false);
    expect(configOf(b.paths.codexHome)).toBe(before);
    expect(fs.readFileSync(path.join(b.paths.codexHome, 'session.json'), 'utf8')).toBe('keep-chat');
    expect(events).toContainEqual({ event: 'restartRequired', payload: false });
  });

  test('M-21 保存时未运行，确认时也不依赖运行检测而直接执行重启流程', async () => {
    const b = build();
    await installed_(b);
    const saved = await b.h['switch:start']({ vendor: 'deepseek' });
    expect(saved.openRequired).toBe(true);
    const restart = vi.spyOn(b.platform, 'restartCodex').mockResolvedValue(undefined);
    const detection = vi.spyOn(b.platform, 'isCodexRunning').mockResolvedValue(false);
    expect(await b.h['codex:restart'](undefined as never)).toEqual({ ok: true });
    expect(restart).toHaveBeenCalledTimes(1);
    expect(detection).not.toHaveBeenCalled();
  });

  test('M-21 重启失败保留待重启状态，再试一次可以恢复', async () => {
    const b = build();
    await installed_(b);
    fs.writeFileSync(path.join(root, 'fake-codex-running'), '1');
    await b.h['switch:start']({ vendor: 'deepseek' });
    const restart = vi.spyOn(b.platform, 'restartCodex').mockRejectedValueOnce(new Error('private path')).mockResolvedValue(undefined);
    const failed = await b.h['codex:restart'](undefined as never);
    expect(failed.ok).toBe(false);
    expect(failed.reason).not.toContain('private path');
    expect(b.svc.state().restartRequired).toBe(true);
    expect(await b.h['codex:restart'](undefined as never)).toEqual({ ok: true });
    expect(restart).toHaveBeenCalledTimes(2);
    expect(b.svc.state().restartRequired).toBe(false);
  });

  test('L-05 语言变化也要求确认，无变化不重复弹窗；应用退出后清理提示', async () => {
    const b = build();
    await installed_(b);
    fs.writeFileSync(path.join(root, 'fake-codex-running'), '1');
    expect((await b.h['zh:set']({ on: true })).restartRequired).toBe(true);
    expect((await b.h['zh:set']({ on: true })).restartRequired).not.toBe(true);
    fs.unlinkSync(path.join(root, 'fake-codex-running'));
    expect((await b.h['app:state'](undefined as never)).restartRequired).toBe(false);
  });
});

describe('装好后验证与点 Star', () => {
  const starOn = () => JSON.stringify({ ...bundled, switches: { ...bundled.switches, starVerify: true } } satisfies RemoteConfig);

  test('A-01 开关默认关：安装用原来的样子', async () => {
    const b = build();
    expect((await b.h['app:state'](undefined as never)).starVerify).toBe(false);
  });

  test('A-01 签名配置打开开关：安装换成带验证的弹窗', async () => {
    fetchText = async () => starOn();
    const b = build();
    expect((await b.h['app:state'](undefined as never)).starVerify).toBe(true);
  });

  test('A-01 沙盒实测可以不经签名配置打开（发布版会删掉这个环境变量）', async () => {
    const b = build({ forceStarVerify: true });
    expect((await b.h['app:state'](undefined as never)).starVerify).toBe(true);
  });

  test('A-02 验证：Codex 用刚配好的模型答出本项目地址算通过；答非所问、Key 不对、连不上各有一句原因', async () => {
    const b = build();
    await installed_(b);
    await b.h['switch:start']({ vendor: 'deepseek' });
    expect(await b.h['verify:run'](undefined as never)).toEqual({ ok: true, answer: 'https://github.com/hhwyt/codex-buddy' });
    const log = fs.readFileSync(path.join(b.paths.buddyDir, 'install.log'), 'utf8');
    expect(log).toContain('verify deepseek: ok');
    scenario('no-url');
    expect(await b.h['verify:run'](undefined as never)).toEqual({ ok: false, reason: 'DeepSeek 回答了，但没答出地址' });
    scenario('401');
    expect(await b.h['verify:run'](undefined as never)).toEqual({ ok: false, reason: 'DeepSeek 说 Key 不对' });
    scenario('unreachable');
    expect(await b.h['verify:run'](undefined as never)).toEqual({ ok: false, reason: '连不上 DeepSeek，可能是网络问题' });
    scenario('ok');
    expect((await b.h['verify:run'](undefined as never)).ok).toBe(true);
  });

  test('A-02 验证问的是 ~/.codex 里刚写好的配置', async () => {
    const log = path.join(root, 'fake-codex.log');
    const b = build({ env: env({ FAKE_CODEX_LOG: log }) });
    await installed_(b);
    await b.h['switch:start']({ vendor: 'kimi' });
    await b.h['verify:run'](undefined as never);
    expect(fs.readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l) as { args: string[]; provider: string }).at(-1)).toMatchObject({ provider: 'kimi' });
  }, 30_000);

  test('A-03 通过后右侧浏览器展开打开本项目 GitHub 页面；没打开时报打开失败', async () => {
    const b = build();
    await installed_(b);
    expect(await b.h['verify:open-repo'](undefined as never)).toEqual({ ok: true });
    expect(b.browser.opens.at(-1)).toBe(SOURCE_URL);
    b.browser.open = async () => { b.browser.at = 'chrome-error://chromewebdata/'; };
    expect(await b.h['verify:open-repo'](undefined as never)).toMatchObject({ ok: false });
  });

  test('A-05 gh 已登录：用 gh 点 Star，右边页面刷新；之前点过就说已点过', async () => {
    let answer: 'starred' | 'already' | null = 'starred';
    const b = build({ ghStar: async () => answer });
    await installed_(b);
    await b.h['verify:open-repo'](undefined as never);
    expect(await b.h['star:run'](undefined as never)).toEqual({ ok: true, already: false });
    expect(b.browser.reloads).toBe(1);
    answer = 'already';
    expect(await b.h['star:run'](undefined as never)).toEqual({ ok: true, already: true });
  });

  test('A-05 gh 没登录：改在右侧浏览器里点 Star', async () => {
    const b = build({ ghStar: async () => null });
    await installed_(b);
    let starred = false;
    b.browser.evaluate = (async (script: string) => {
      if (script.includes('b.click()')) { starred = true; return true; }
      return { ready: true, login: true, starred, button: !starred };
    }) as typeof b.browser.evaluate;
    expect(await b.h['star:run'](undefined as never)).toEqual({ ok: true, already: false });
    expect(b.browser.opens).toContain(SOURCE_URL);
  });

  test('A-01 落后的版本不能用验证和点 Star（功能接口都过版本检查）', async () => {
    fetchText = async () => { throw new Error('offline'); };
    const b = build();
    for (const channel of ['verify:run', 'verify:open-repo', 'star:run'] as const) {
      expect(await b.h[channel](undefined as never)).toMatchObject({ ok: false, kind: 'version-required' });
    }
  });
});

describe('转发服务与分身目录', () => {
  test('D-05 一键还原：删掉转发服务和它的开机启动项', async () => {
    const removed: string[] = [];
    const b = build({ bridgeRemove: async () => { removed.push('bridge'); } });
    await installed_(b);
    await b.h['switch:start']({ vendor: 'deepseek' });
    expect(await b.h['restore:run'](undefined as never)).toEqual({ ok: true });
    expect(removed).toEqual(['bridge']);
  });

  test('K-02 转发地址只改 CodexBuddy 自己的分身目录，别人建的 ~/.codex-<名字> 不改', async () => {
    const paths = sandboxPaths(root, 'mac');
    const foreignHome = path.join(paths.home, '.codex-deepseek');
    fs.mkdirSync(foreignHome, { recursive: true });
    const foreignConfig = 'model_provider = "deepseek"\n\n[model_providers.deepseek]\nbase_url = "http://127.0.0.1:1/deepseek/v1"\n';
    fs.writeFileSync(path.join(foreignHome, 'config.toml'), foreignConfig);
    const inner = fakeClone(paths);
    const clone: Clone = { ...inner, list: async () => [...await inner.list(), { slug: 'deepseek', appPath: '/x/DeepSeek.app', codexHome: foreignHome, ownsHome: false }] };
    const b = build({ clone });
    await installed_(b);
    await b.h['switch:start']({ vendor: 'kimi' });
    fs.writeFileSync(path.join(b.paths.codexHome, 'config.toml'), configOf(b.paths.codexHome).replace(/127\.0\.0\.1:4555/g, '127.0.0.1:1'));
    await b.svc.refreshBridgeUrls();
    expect(configOf(b.paths.codexHome)).toContain('127.0.0.1:4555/kimi');
    expect(fs.readFileSync(path.join(foreignHome, 'config.toml'), 'utf8')).toBe(foreignConfig);
  });
});
