// L2: 分身 on Windows (C-01..C-10) in a temp sandbox with Windows paths. Shortcuts go through a recording writer
// (Electron's shell.writeShortcutLink in the app); wscript.exe is recorded, not run.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import type { CommandRunner } from '../../electron/platform/clone-mac';
import { appUserModelIdOf, createWinClone, launcherVbs, pngToIco, type ShortcutSpec } from '../../electron/platform/clone-win';
import { nodeFs } from '../../electron/platform/node-fs';
import { sandboxPaths } from '../../electron/platform/sandbox';
import type { Platform } from '../../electron/platform/types';

const logo = path.join(__dirname, '..', '..', 'ui', 'assets', 'logos', 'deepseek.png');
let root: string;
let platform: Platform;
let calls: string[][];
let shortcuts: Map<string, ShortcutSpec>;
const location = 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1_x64';

const run: CommandRunner = async (cmd, args) => { calls.push([cmd, ...args]); return ''; };
const writeShortcut = (lnk: string, spec: ShortcutSpec) => { shortcuts.set(lnk, spec); fs.writeFileSync(lnk, JSON.stringify(spec)); };
const spec = (over: Partial<{ slug: string; displayName: string; iconPng: string; zh: boolean }> = {}) =>
  ({ slug: 'deepseek', displayName: 'DeepSeek', iconPng: logo, zh: false, ...over });
const make = (deps = {}) => createWinClone(platform, { run, writeShortcut, codexLocation: async () => location, appData: path.join(root, 'home', 'AppData', 'Roaming'), ...deps });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-clone-win-'));
  platform = {
    os: 'win', paths: sandboxPaths(root, 'win'), fs: nodeFs,
    findCodex: async () => ({ version: '26.1', location, cli: '', running: false }),
  } as unknown as Platform;
  calls = [];
  shortcuts = new Map();
});

describe('分身 Windows', () => {
  test('C-01 做成分身：带自己 AppUserModelID 的启动器，桌面和开始菜单各一个', async () => {
    const info = await make().make(spec());
    expect(info).toEqual({ slug: 'deepseek', appPath: path.join(platform.paths.appsDir, 'deepseek'), codexHome: path.join(root, 'home', '.codex-deepseek') });
    const lnks = [path.join(platform.paths.desktopDir, 'DeepSeek.lnk'), path.join(platform.paths.startMenuDir, 'DeepSeek.lnk')];
    for (const lnk of lnks) {
      expect(shortcuts.get(lnk)).toMatchObject({ target: 'wscript.exe', args: `"${path.join(info.appPath, 'launch.vbs')}"`, appUserModelId: 'CodexBuddy.Deepseek' });
    }
    expect(await make().list()).toEqual([info]);
  });

  test('C-05 分身的名字和图标是厂商自己的', async () => {
    const info = await make().make(spec());
    const ico = fs.readFileSync(path.join(info.appPath, 'icon.ico'));
    expect([...ico.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
    expect(ico.subarray(22, 26).toString('latin1')).toBe('\x89PNG');
    const lnk = shortcuts.get(path.join(platform.paths.desktopDir, 'DeepSeek.lnk'))!;
    expect(lnk.icon).toBe(path.join(info.appPath, 'icon.ico'));
    expect(lnk.description).toBe('DeepSeek');
    expect(appUserModelIdOf('kimi')).toBe('CodexBuddy.Kimi');
  });

  test('C-04 分身用自己的 CODEX_HOME 和数据目录', async () => {
    const info = await make().make(spec());
    const vbs = fs.readFileSync(path.join(info.appPath, 'launch.vbs'), 'utf8');
    const userData = path.join(root, 'home', 'AppData', 'Roaming', 'Codex (DeepSeek)');
    expect(vbs).toContain(`env("CODEX_HOME") = "${info.codexHome}"`);
    expect(vbs).toContain(`--user-data-dir=""${userData}""`);
    expect(vbs).toContain(`""${path.join(location, 'app', 'Codex.exe')}""`);
    expect(vbs).not.toContain('remote-debugging');
    expect(fs.existsSync(userData)).toBe(true);
    expect(fs.existsSync(path.join(root, 'home', '.codex'))).toBe(false);
  });

  test('C-02 打开分身：运行分身的启动器', async () => {
    const clone = make();
    const info = await clone.make(spec());
    await clone.open('deepseek');
    expect(calls).toContainEqual(['wscript.exe', path.join(info.appPath, 'launch.vbs')]);
    await expect(clone.open('kimi')).rejects.toThrow('这个分身还没做');
  });

  test('C-07 删除分身只删启动器和快捷方式，~/.codex-deepseek 留着', async () => {
    const clone = make();
    const info = await clone.make(spec());
    fs.mkdirSync(path.join(info.codexHome, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(info.codexHome, 'sessions', 'chat.jsonl'), 'chat');
    await clone.remove('deepseek');
    expect(fs.existsSync(info.appPath)).toBe(false);
    expect(fs.existsSync(path.join(platform.paths.desktopDir, 'DeepSeek.lnk'))).toBe(false);
    expect(fs.existsSync(path.join(platform.paths.startMenuDir, 'DeepSeek.lnk'))).toBe(false);
    expect(fs.readFileSync(path.join(info.codexHome, 'sessions', 'chat.jsonl'), 'utf8')).toBe('chat');
    expect(fs.existsSync(path.join(root, 'home', 'AppData', 'Roaming', 'Codex (DeepSeek)'))).toBe(true);
  });

  test('C-08 再做同名分身接上原来的记录；改了名字时旧快捷方式换掉', async () => {
    const clone = make();
    const first = await clone.make(spec());
    fs.writeFileSync(path.join(first.codexHome, 'history.jsonl'), 'old');
    await clone.remove('deepseek');
    const again = await clone.make(spec({ displayName: 'DeepSeek 分身' }));
    expect(fs.readFileSync(path.join(again.codexHome, 'history.jsonl'), 'utf8')).toBe('old');
    await clone.make(spec());
    expect(fs.existsSync(path.join(platform.paths.desktopDir, 'DeepSeek 分身.lnk'))).toBe(false);
    expect(fs.existsSync(path.join(platform.paths.desktopDir, 'DeepSeek.lnk'))).toBe(true);
  });

  test('C-10 一键还原时分身一起去掉，数据目录留着', async () => {
    const clone = make();
    const a = await clone.make(spec());
    const b = await clone.make(spec({ slug: 'kimi', displayName: 'Kimi' }));
    fs.mkdirSync(path.join(platform.paths.appsDir, 'not-a-clone'), { recursive: true });
    for (const c of await clone.list()) await clone.remove(c.slug);
    expect(await clone.list()).toEqual([]);
    expect(fs.existsSync(a.codexHome) && fs.existsSync(b.codexHome)).toBe(true);
    expect(fs.existsSync(path.join(platform.paths.appsDir, 'not-a-clone'))).toBe(true);
  });

  test('L-07 分身跟着汉化开关走', async () => {
    const clone = make();
    const info = await clone.make(spec({ zh: true }));
    const vbs = () => fs.readFileSync(path.join(info.appPath, 'launch.vbs'), 'utf8');
    expect(vbs()).toContain('--remote-debugging-address=127.0.0.1');
    await clone.setZh(false);
    expect(vbs()).not.toContain('remote-debugging');
    expect(vbs()).toContain('env("CODEXBUDDY_ZH") = "0"');
    shortcuts.clear();
    await clone.setZh(false);
    expect(shortcuts.size).toBe(0);
  });

  test('C-01 没装 Codex 时做不成；图标不是 PNG 时用 Codex 自己的图标', async () => {
    await expect(createWinClone({ ...platform, findCodex: async () => null }, { run, writeShortcut }).make(spec())).rejects.toThrow('没找到 Codex');
    const webp = path.join(root, 'openai.webp');
    fs.writeFileSync(webp, 'RIFFxxxxWEBP');
    const info = await make().make(spec({ slug: 'openai', displayName: 'OpenAI', iconPng: webp }));
    expect(fs.existsSync(path.join(info.appPath, 'icon.ico'))).toBe(false);
    expect(shortcuts.get(path.join(platform.paths.desktopDir, 'OpenAI.lnk'))!.icon).toBe(path.join(location, 'app', 'Codex.exe'));
    const missing = await make().make(spec({ slug: 'qwen', displayName: 'Qwen', iconPng: path.join(root, 'none.png') }));
    expect(fs.existsSync(path.join(missing.appPath, 'icon.ico'))).toBe(false);
  });

  test('快捷方式建不成时报错（Electron 之外没有 shell）', async () => {
    const clone = createWinClone(platform, { run, codexLocation: async () => location });
    await expect(clone.make(spec())).rejects.toThrow();
  });

  test('pngToIco：大图标记 0，非 PNG 返回空；VBS 字符串转义引号', () => {
    const png = fs.readFileSync(logo);
    const big = new Uint8Array(png);
    new DataView(big.buffer).setUint32(16, 512);
    new DataView(big.buffer).setUint32(20, 256);
    const ico = pngToIco(big)!;
    expect([ico[6], ico[7]]).toEqual([0, 0]);
    expect(pngToIco(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(launcherVbs({ slug: 's', name: 'n', exe: 'e', codexHome: 'C:\\a"b', userData: 'u', zh: false })).toContain('"C:\\a""b"');
    // a broken clone.json is ignored by list()
    fs.mkdirSync(path.join(platform.paths.appsDir, 'bad'), { recursive: true });
    fs.writeFileSync(path.join(platform.paths.appsDir, 'bad', 'clone.json'), '{');
    return expect(make().list()).resolves.toEqual([]);
  });
});
