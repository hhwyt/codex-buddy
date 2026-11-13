// Main-process glue: AES-GCM secrets at rest, IPC registration, sandbox Codex stand-ins.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const ipc = vi.hoisted(() => ({ handlers: new Map<string, (e: unknown, a: unknown) => unknown>(), removed: [] as string[] }));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (c: string, fn: (e: unknown, a: unknown) => unknown) => { ipc.handlers.set(c, fn); },
    removeHandler: (c: string) => { ipc.removed.push(c); },
  },
}));

import { aesCipher, loadDataKey, plainWrap } from '../../electron/main/cipher';
import { registerIpc, sendEvent } from '../../electron/main/ipc';
import { CHANNELS } from '../../electron/main/ipc-contract';
import { nodeFs } from '../../electron/platform/node-fs';
import { createMacPlatform } from '../../electron/platform/mac';
import { fakeCodexRunner, sandboxClone, sandboxPlatform, sandboxZh } from '../../electron/platform/sandbox-codex';
import { sandboxPaths } from '../../electron/platform/sandbox';
import type { Clone, ZhLauncher } from '../../electron/platform/types';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-wire-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('cipher', () => {
  test('S-08 Key 用 AES-256-GCM 加密存，能解回来，改一个字节就解不开', () => {
    const c = aesCipher(new Uint8Array(32).fill(1));
    const enc = c.encrypt('sk-secret-1234');
    expect(Buffer.from(enc).toString('utf8')).not.toContain('sk-secret');
    expect(c.decrypt(enc)).toBe('sk-secret-1234');
    enc[enc.length - 1] ^= 1;
    expect(() => c.decrypt(enc)).toThrow();
    expect(() => aesCipher(new Uint8Array(16))).toThrow('32 bytes');
  });

  test('S-08 数据密钥第一次生成并包一层存下，之后读回同一把', () => {
    const file = path.join(root, 'buddy', 'data-key.bin');
    const wrap = { encrypt: (b: Buffer) => Buffer.from(b.toString('hex')), decrypt: (b: Buffer) => Buffer.from(b.toString(), 'hex') };
    const k1 = loadDataKey(nodeFs, file, wrap);
    expect(k1).toHaveLength(32);
    expect(fs.readFileSync(file, 'utf8')).toBe(Buffer.from(k1).toString('hex'));
    expect(Buffer.from(loadDataKey(nodeFs, file, wrap))).toEqual(Buffer.from(k1));
    expect(plainWrap.decrypt(plainWrap.encrypt(Buffer.from('x'))).toString()).toBe('x');
  });
});

describe('ipc', () => {
  test('W-02 每个通道都注册；没做的通道回「还没做好」；出错时原因里没有 Key', async () => {
    registerIpc({
      'wallet:mode': () => { throw new Error('bad key sk-abcdefghijklmnopqrstu'); },
      'install:log': () => ({ text: 'ok' }),
    });
    expect([...ipc.handlers.keys()].sort()).toEqual(CHANNELS.map(c => `buddy:${c}`).sort());
    expect(ipc.removed).toHaveLength(CHANNELS.length);
    expect(await ipc.handlers.get('buddy:install:log')!({}, undefined)).toEqual({ text: 'ok' });
    expect(await ipc.handlers.get('buddy:app:state')!({}, undefined)).toEqual({ ok: false, reason: '这个功能还没做好' });
    const r = await ipc.handlers.get('buddy:wallet:mode')!({}, { mode: 'clone' }) as { reason: string };
    expect(r.reason).toMatch(/^出了意外：/);
    expect(r.reason).not.toContain('abcdefghijklmnop');
  });

  test('W-02 事件只发给还开着的窗口', () => {
    const sent: unknown[] = [];
    const win = { isDestroyed: () => false, webContents: { send: (...a: unknown[]) => sent.push(a) } };
    sendEvent(win as never, 'wallet', { order: [], active: null, cards: [], mode: 'switch' });
    sendEvent({ ...win, isDestroyed: () => true } as never, 'wallet', { order: [], active: null, cards: [], mode: 'switch' });
    sendEvent(null, 'wallet', { order: [], active: null, cards: [], mode: 'switch' });
    expect(sent).toHaveLength(1);
  });
});

describe('sandbox Codex', () => {
  const FAKE = path.join(__dirname, '..', 'fakes', 'fake-codex.mjs');

  test('X-01 沙盒的假 Codex：装、找、跑、卸，全在沙盒里', async () => {
    const paths = sandboxPaths(root, 'mac');
    const opened: string[] = [];
    const p = sandboxPlatform(createMacPlatform(paths), {
      root, env: { CODEXBUDDY_FAKE_CODEX: FAKE, CODEXBUDDY_FAKE_INSTALL_MS: '0' },
      open: async t => { opened.push(t); }, reveal: async t => { opened.push(`r:${t}`); },
    });
    expect(await p.findCodex()).toBeNull();
    expect(await p.uninstallCodex()).toEqual({ ok: true });
    expect((await p.installCodex(() => {})).ok).toBe(true);
    const c = await p.findCodex();
    expect(c).toMatchObject({ version: '26.1.0', location: path.join(root, 'Applications', 'Test-ChatGPT.app'), running: false });
    fs.mkdirSync(paths.codexHome, { recursive: true });
    const r = await p.runCodex(['--version'], { codexHome: paths.codexHome, timeoutMs: 10_000 });
    expect(r.out).toContain('codex-cli');
    await p.openCodex({ zh: true });
    await p.revealInFolder('/x');
    expect(opened).toEqual([path.join(root, 'Applications', 'Test-ChatGPT.app'), 'r:/x']);
    fs.writeFileSync(path.join(root, 'fake-codex-running'), '');
    expect(await p.uninstallCodex()).toEqual({ ok: false, reason: '先退出 Codex 再还原' });
    fs.rmSync(path.join(root, 'fake-codex-running'));
    expect(await p.uninstallCodex()).toEqual({ ok: true });
    expect(await p.findCodex()).toBeNull();
  });

  test('O-03 沙盒安装一直失败；假 Codex 跑超时、跑不起来都有结果', async () => {
    const paths = sandboxPaths(root, 'mac');
    const p = sandboxPlatform(createMacPlatform(paths), { root, env: { CODEXBUDDY_FAKE_INSTALL: 'fail' }, open: async () => {}, reveal: async () => {} });
    expect((await p.installCodex(() => {})).ok).toBe(false);
    expect((await p.installCodex(() => {})).ok).toBe(false);
    fs.mkdirSync(paths.codexHome, { recursive: true });
    fs.writeFileSync(path.join(paths.home, 'fake-codex-scenario'), 'timeout');
    const slow = await fakeCodexRunner(process.execPath, FAKE)(['exec', 'hi'], { codexHome: paths.codexHome, timeoutMs: 300 });
    expect(slow.timedOut).toBe(true);
    fs.writeFileSync(path.join(paths.home, 'fake-codex-scenario'), 'unreachable');
    const early = await fakeCodexRunner(process.execPath, FAKE)(['exec', 'hi'], { codexHome: paths.codexHome, timeoutMs: 10_000, stopEarly: e => /Reconnecting/.test(e) });
    expect(early.err).toContain('Reconnecting');
    const broken = await fakeCodexRunner(path.join(root, 'no-node'), FAKE)(['--version'], { codexHome: paths.codexHome, timeoutMs: 1000 });
    expect(broken.err).toMatch(/ENOENT/);
  });

  test('L-06 / C-02 沙盒的汉化支持跟着环境变量，分身用打开器打开', async () => {
    const zh: ZhLauncher = { exists: async () => false, add: async () => {}, remove: async () => {}, supported: async () => true };
    expect(await sandboxZh(zh, { CODEXBUDDY_FAKE_ZH: 'unsupported' }).supported()).toBe(false);
    expect(await sandboxZh(zh, {}).supported()).toBe(true);
    const opened: string[] = [];
    const base: Clone = { list: async () => [{ slug: 'kimi', appPath: '/A/Kimi.app', codexHome: '/h' }], make: async () => ({ slug: '', appPath: '', codexHome: '' }), open: async () => { throw new Error('real open'); }, remove: async () => {}, setZh: async () => {} };
    await sandboxClone(base, async t => { opened.push(t); }).open('kimi');
    expect(opened).toEqual(['/A/Kimi.app']);
    await expect(sandboxClone(base, async () => {}).open('x')).rejects.toThrow('没有这个分身');
  });
});
