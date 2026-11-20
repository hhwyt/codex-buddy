// L2: real-vendor test runs on Windows (CODEXBUDDY_REAL_CODEX=1): the real Store Codex next to the user's own, with
// the sandbox's CODEX_HOME and data dir; install / uninstall never touch the Store package; 汉化版 is a clone-style
// launcher at the sandbox's desktop and Start menu.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { ShortcutSpec } from '../../electron/platform/clone-win';
import { nodeFs } from '../../electron/platform/node-fs';
import { sandboxPaths } from '../../electron/platform/sandbox';
import { realSandboxWin, runningPs } from '../../electron/platform/sandbox-real-win';
import type { Platform } from '../../electron/platform/types';

let root: string;
let installed: boolean;
let running: string;
let launched: { exe: string; args: string[]; env: Record<string, string> }[];
let runs: string[][];
let ps: string[];
const alias = 'C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\chatgpt-desktop.exe';

function build() {
  const paths = sandboxPaths(root, 'win');
  const base = {
    os: 'win', paths, fs: nodeFs,
    findCodex: async () => (installed ? { version: '26.1', location: 'C:\\pkg', cli: 'C:\\pkg\\codex.exe', running: true } : null),
    installCodex: async () => { throw new Error('must not install'); },
    uninstallCodex: async () => { throw new Error('must not uninstall'); },
  } as unknown as Platform;
  const appData = path.join(paths.home, 'AppData', 'Roaming');
  return {
    paths, appData,
    ...realSandboxWin(base, {
      shell: { powershell: async command => { ps.push(command); return { code: 0, out: `${running}\n` }; } },
      appData, alias,
      launch: (exe, args, env) => { launched.push({ exe, args, env }); },
      cloneDeps: {
        run: async (cmd, args) => { runs.push([cmd, ...args]); return ''; },
        writeShortcut: (lnk: string, spec: ShortcutSpec) => fs.writeFileSync(lnk, JSON.stringify(spec)),
        nodeRunner: 'C:\\CodexBuddy.exe',
      },
    }),
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-real-win-'));
  installed = true; running = '0'; launched = []; runs = []; ps = [];
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('真实厂商实测模式（Windows）', () => {
  test('G-01 装和卸都不碰商店版 Codex：已装就打勾，没装就失败；还原时不卸载', async () => {
    const { platform } = build();
    const events: string[] = [];
    expect(await platform.installCodex(e => events.push(`${e.state}:${e.text}`))).toEqual({ ok: true });
    installed = false;
    expect(await platform.installCodex(e => events.push(`${e.state}:${e.text}`))).toEqual({ ok: false, reason: '没找到 Codex' });
    expect(events).toEqual(['done:Codex 已装好', 'fail:没找到 Codex']);
    expect(await platform.uninstallCodex()).toEqual({ ok: true });
    expect(await platform.findCodex()).toBeNull();
  });

  test('L-05 「Codex 开着」只看沙盒自己的 Codex（命令行里带它的数据目录），不看站主自己的', async () => {
    const { platform, appData } = build();
    const dir = path.join(appData, 'Codex (ChatGPT 汉化版)');
    expect(await platform.isCodexRunning()).toBe(false);
    expect((await platform.findCodex())!.running).toBe(false);
    running = '2';
    expect(await platform.isCodexRunning()).toBe(true);
    expect(ps[0]).toBe(runningPs(dir));
    expect(runningPs("C:\\a'b")).toContain("Contains('C:\\a''b')");
  });

  test('打开 Codex：真的 Codex 用沙盒的 CODEX_HOME 和自己的数据目录，和站主的 Codex 同时开', async () => {
    const { platform, paths, appData } = build();
    await platform.openCodex({ zh: true }); // no 汉化版 yet: plain
    const dir = path.join(appData, 'Codex (ChatGPT 汉化版)');
    expect(launched).toEqual([{ exe: alias, args: [`--user-data-dir=${dir}`], env: { CODEX_HOME: paths.codexHome, CODEX_ELECTRON_USER_DATA_PATH: dir } }]);
    expect(fs.existsSync(paths.codexHome)).toBe(true);
  });

  test('L-02 L-04 汉化版：沙盒桌面和开始菜单的「ChatGPT 汉化版」，从它打开；去掉只删入口，不算分身', async () => {
    const { platform, zh, clone, paths } = build();
    expect(await zh.supported()).toBe(true);
    expect(await zh.exists()).toBe(false);
    await zh.add();
    expect(await zh.exists()).toBe(true);
    expect(fs.existsSync(path.join(paths.desktopDir, 'ChatGPT 汉化版.lnk'))).toBe(true);
    const launcher = path.join(paths.buddyDir, 'zh-launcher', 'zh');
    const cfg = JSON.parse(fs.readFileSync(path.join(launcher, 'zh.json'), 'utf8'));
    expect(cfg.env.CODEX_HOME).toBe(paths.codexHome);
    expect(await clone.list()).toEqual([]);
    await platform.openCodex({ zh: true });
    expect(runs).toEqual([['wscript.exe', path.join(launcher, 'launch.vbs')]]);
    fs.writeFileSync(path.join(paths.codexHome, 'history.jsonl'), 'chat');
    await zh.remove();
    expect(await zh.exists()).toBe(false);
    expect(fs.readFileSync(path.join(paths.codexHome, 'history.jsonl'), 'utf8')).toBe('chat');
    installed = false;
    expect(await zh.supported()).toBe(false);
  });

  test('C-01 分身：数据目录在沙盒的 AppData 里', async () => {
    const { clone, appData } = build();
    const info = await clone.make({ slug: 'kimi', displayName: 'Kimi', iconPng: '', zh: false });
    expect(JSON.parse(fs.readFileSync(path.join(info.appPath, 'clone.json'), 'utf8')).userData).toBe(path.join(appData, 'Codex (CodexBuddy Kimi)'));
  });
});
