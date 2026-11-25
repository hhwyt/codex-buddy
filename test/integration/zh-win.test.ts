// L2: 汉化版 shortcuts on Windows, against a sandbox (Windows layout) in a temp dir. codex.ps1 is replaced by a fake
// runner that creates the shortcuts the way CODEX_SETUP_ACTION=edition does; nothing runs PowerShell for real.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { GuardError } from '../../electron/core/guard';
import { sandboxPaths } from '../../electron/platform/sandbox';
import type { Paths, Platform } from '../../electron/platform/types';
import { createWinPlatform } from '../../electron/platform/win';
import {
  bundledPs1, createWinZh, isWinCodexRunning, OLD_ZH_SHORTCUT, realPs1Runner, ZH_SHORTCUT, type Ps1Runner,
} from '../../electron/platform/zh-win';
import { hashTree } from './zh-helpers';

let root: string, paths: Paths, calls: Record<string, string>[];
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-zh-win-'));
  paths = sandboxPaths(root, 'win');
  fs.mkdirSync(path.join(paths.codexHome, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(paths.codexHome, 'sessions', 'chat.jsonl'), '{"hello":1}');
  fs.mkdirSync(paths.codexAppDataDirs[0], { recursive: true });
  fs.writeFileSync(path.join(paths.codexAppDataDirs[0], 'Preferences'), '{}');
  calls = [];
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const desktopLink = () => path.join(paths.desktopDir, ZH_SHORTCUT);
const startLink = () => path.join(paths.startMenuDir, ZH_SHORTCUT);
/** Does what codex.ps1's edition action does: the two shortcuts */
const ps1: Ps1Runner = async env => {
  calls.push(env);
  for (const link of [desktopLink(), startLink()]) { fs.mkdirSync(path.dirname(link), { recursive: true }); fs.writeFileSync(link, 'lnk'); }
  return { code: 0, out: 'STEP:edition:done:汉化版' };
};
const zh = (runPs1: Ps1Runner = ps1, version: string | null = '26.1027.0') =>
  createWinZh(createWinPlatform(paths), { runPs1, codexVersion: async () => version });
const dataHash = () => hashTree(paths.codexHome) + hashTree(paths.codexAppDataDirs[0]);

describe('汉化版 on Windows', () => {
  test('L-01 默认英文原版：没加之前桌面和开始菜单都没有汉化版', async () => {
    expect(await zh().exists()).toBe(false);
    expect(await zh().supported()).toBe(true);
  });

  test('L-02 加汉化版：用 codex.ps1 的汉化启动器，在桌面和开始菜单加「ChatGPT 汉化版」', async () => {
    const z = zh();
    await z.add();
    expect(calls).toEqual([{ CODEX_SETUP_ACTION: 'edition', CODEX_SETUP_EDITION: 'zh' }]);
    expect(await z.exists()).toBe(true);
    expect(paths.zhLauncherPath).toBe(startLink());
  });

  test('L-06 汉化不了：脚本失败或没生成快捷方式时报错，没装 Codex 时不能汉化', async () => {
    await expect(zh(async () => ({ code: 1, out: '' })).add()).rejects.toThrow('汉化版没加上');
    await expect(zh(async () => ({ code: 0, out: '' })).add()).rejects.toThrow('汉化版没加上');
    const none = zh(ps1, null);
    expect(await none.supported()).toBe(false);
    await expect(none.add()).rejects.toThrow('没找到 Codex');
    expect(calls).toEqual([]);
  });

  test('L-06 这一版被汉化启动器关掉了：显示不能汉化', async () => {
    fs.mkdirSync(paths.buddyDir, { recursive: true });
    fs.writeFileSync(path.join(paths.buddyDir, 'disabled-26.1027.0.txt'), '');
    expect(await zh().supported()).toBe(false);
    expect(await zh(ps1, '26.1100.0').supported()).toBe(true);
  });

  test('L-06 平台还认不出 Codex 版本时按没装处理', async () => {
    expect(await createWinZh(createWinPlatform(paths), { runPs1: ps1 }).supported()).toBe(false);
    const found = { ...createWinPlatform(paths), findCodex: async () => ({ version: '1.2', location: 'x', cli: 'y', running: false }) } as Platform;
    expect(await createWinZh(found, { runPs1: ps1 }).supported()).toBe(true);
  });

  test('L-04 去掉汉化版：只删两个快捷方式（含旧名字），聊天记录和数据目录哈希不变', async () => {
    const z = zh();
    await z.add();
    fs.writeFileSync(path.join(paths.desktopDir, OLD_ZH_SHORTCUT), 'old');
    const before = dataHash();
    await z.remove();
    expect(await z.exists()).toBe(false);
    expect(fs.readdirSync(paths.desktopDir)).toEqual([]);
    expect(dataHash()).toBe(before);
    await z.remove();
  });

  test('L-04 删除走 guard：快捷方式目录指向用户数据时拒绝', async () => {
    const bad = { ...paths, desktopDir: paths.codexHome };
    const z = createWinZh(createWinPlatform(bad), { runPs1: ps1, codexVersion: async () => '1' });
    const before = dataHash();
    await expect(z.remove()).rejects.toBeInstanceOf(GuardError);
    expect(dataHash()).toBe(before);
  });

  test('L-05 能检测 Codex 开没开', async () => {
    expect(await isWinCodexRunning(async () => ({ code: 0, out: '"ChatGPT.exe","1234","Console","1","120,000 K"\r\n' }))).toBe(true);
    expect(await isWinCodexRunning(async () => ({ code: 0, out: 'INFO: No tasks are running which match the specified criteria.' }))).toBe(false);
  });
});

describe('汉化版 on Windows: running codex.ps1', () => {
  test('L-02 用 PowerShell 跑打包里的 codex.ps1，带上汉化参数', async () => {
    const seen: any[] = [];
    const fake: any = (cmd: string, args: string[], opts: any, cb: (e: any, out: string) => void) => { seen.push({ cmd, args, opts }); cb(null, 'ok'); };
    expect(await realPs1Runner('C:\\x\\codex.ps1', fake)({ CODEX_SETUP_EDITION: 'zh' })).toEqual({ code: 0, out: 'ok' });
    expect(seen[0].cmd).toBe('powershell.exe');
    expect(seen[0].args).toEqual(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      "iex ([IO.File]::ReadAllText('C:\\x\\codex.ps1', [Text.Encoding]::UTF8))"]);
    expect(seen[0].opts.env.CODEX_SETUP_EDITION).toBe('zh');
    const failing: any = (_c: string, _a: string[], _o: any, cb: (e: any, out: string) => void) => cb({ code: 2 }, '');
    expect((await realPs1Runner('p', failing)({})).code).toBe(2);
    const spawnError: any = (_c: string, _a: string[], _o: any, cb: (e: any, out: string) => void) => cb({ code: 'ENOENT' }, '');
    expect((await realPs1Runner('p', spawnError)({})).code).toBe(1);
  });

  test('L-02 codex.ps1 从 asar 外面的解包目录读', () => {
    expect(bundledPs1('/A/CodexBuddy/resources/app.asar/dist/platform')).toBe(path.normalize('/A/CodexBuddy/resources/app.asar.unpacked/scripts/vendor/codex.ps1'));
    expect(fs.existsSync(bundledPs1(path.join(__dirname, '..', '..', 'dist', 'platform')))).toBe(true);
    expect(typeof realPs1Runner()).toBe('function');
  });
});
