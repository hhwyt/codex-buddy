// L2: 分身 on Windows (C-01..C-10) in a temp sandbox with Windows paths. Shortcuts go through a recording writer
// (Electron's shell.writeShortcutLink in the app); wscript.exe is recorded, not run. The 汉化 runner (L-07) really runs,
// against a fake opener and a fake DevTools port.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import type { CommandRunner } from '../../electron/platform/clone-mac';
import { appUserModelIdOf, createWinClone, launcherVbs, pngToIco, utf16le, type ShortcutSpec } from '../../electron/platform/clone-win';
import { nodeFs } from '../../electron/platform/node-fs';
import { sandboxPaths } from '../../electron/platform/sandbox';
import type { Platform } from '../../electron/platform/types';
import type { ZhRunnerConfig } from '../../electron/platform/zh-mac';
import { cdpServer, fakeOpener, readRecord, waitFor } from './zh-helpers';

const logo = path.join(__dirname, '..', '..', 'ui', 'assets', 'logos', 'deepseek.png');
let root: string;
let platform: Platform;
let calls: string[][];
let shortcuts: Map<string, ShortcutSpec>;
const location = 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1_x64';
const alias = 'C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\chatgpt-desktop.exe';
const nodeRunner = 'C:\\Program Files\\CodexBuddy\\CodexBuddy.exe';

const run: CommandRunner = async (cmd, args) => { calls.push([cmd, ...args]); return ''; };
const writeShortcut = (lnk: string, spec: ShortcutSpec) => { shortcuts.set(lnk, spec); fs.writeFileSync(lnk, JSON.stringify(spec)); };
const spec = (over: Partial<{ slug: string; displayName: string; iconPng: string; zh: boolean }> = {}) =>
  ({ slug: 'deepseek', displayName: 'DeepSeek', iconPng: logo, zh: false, ...over });
const make = (deps = {}) => createWinClone(platform, {
  run, writeShortcut, codex: async () => ({ location, version: '26.1' }), appData: path.join(root, 'home', 'AppData', 'Roaming'), alias, nodeRunner, ...deps,
});
/** launch.vbs is UTF-16 with a BOM (wscript) */
const readVbs = (dir: string) => {
  const b = fs.readFileSync(path.join(dir, 'launch.vbs'));
  expect([...b.subarray(0, 2)]).toEqual([0xff, 0xfe]);
  return b.subarray(2).toString('utf16le');
};
const zhJson = (dir: string): ZhRunnerConfig => JSON.parse(fs.readFileSync(path.join(dir, 'zh.json'), 'utf8'));

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
    expect(info).toEqual({ slug: 'deepseek', appPath: path.join(platform.paths.appsDir, 'deepseek'), codexHome: path.join(root, 'home', '.codex-codexbuddy-deepseek') });
    const lnks = [path.join(platform.paths.desktopDir, 'DeepSeek.lnk'), path.join(platform.paths.startMenuDir, 'DeepSeek.lnk')];
    for (const lnk of lnks) {
      expect(shortcuts.get(lnk)).toMatchObject({ target: 'wscript.exe', args: `"${path.join(info.appPath, 'launch.vbs')}"`, appUserModelId: 'CodexBuddy.Deepseek' });
    }
    expect(await make().list()).toEqual([{ ...info, ownsHome: true }]);
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

  test('C-04 分身用自己的 CODEX_HOME 和数据目录，经 Codex 的启动别名打开（不是 app\\Codex.exe 空壳）', async () => {
    const info = await make().make(spec({ slug: 'zhipu', displayName: '智谱' }));
    const vbs = readVbs(info.appPath);
    const userData = path.join(root, 'home', 'AppData', 'Roaming', 'Codex (CodexBuddy 智谱)');
    expect(vbs).toContain(`env("CODEX_HOME") = "${info.codexHome}"`);
    expect(vbs).toContain(`sh.Run """${alias}"" --user-data-dir=""${userData}""", 1, False`);
    expect(vbs).not.toContain('Codex.exe');
    expect(vbs).not.toContain('ELECTRON_RUN_AS_NODE');
    expect(fs.existsSync(userData)).toBe(true);
    expect(fs.existsSync(path.join(root, 'home', '.codex'))).toBe(false);
    expect(zhJson(info.appPath)).toMatchObject({ cmd: alias, args: [`--user-data-dir=${userData}`], env: { CODEX_HOME: info.codexHome }, version: '26.1', runningPattern: userData });
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
    expect(fs.existsSync(path.join(root, 'home', 'AppData', 'Roaming', 'Codex (CodexBuddy DeepSeek)'))).toBe(true);
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

  test('L-07 分身跟着汉化开关走：汉化时启动器用 CodexBuddy 跑汉化程序，关了汉化直接打开', async () => {
    const clone = make();
    const info = await clone.make(spec({ zh: true }));
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const runner = `"${nodeRunner}" --run-script "${path.join(info.appPath, 'zh-runner.js')}" "${path.join(info.appPath, 'zh.json')}"`;
    expect(readVbs(info.appPath)).toContain(`sh.Run ${q(runner)}, 0, False`);
    expect(readVbs(info.appPath)).not.toContain('ELECTRON_RUN_AS_NODE');
    await clone.setZh(false);
    expect(readVbs(info.appPath)).not.toContain('zh-runner.js');
    shortcuts.clear();
    await clone.setZh(false);
    expect(shortcuts.size).toBe(0);
    await clone.setZh(true);
    expect(readVbs(info.appPath)).toContain('zh-runner.js');
  });

  test('L-07 分身的汉化程序：以 127.0.0.1 端口打开分身自己的 Codex，每个页面打开 enable_i18n', async () => {
    const info = await make().make(spec({ zh: true }));
    const record = path.join(root, 'opened.jsonl');
    const config = zhJson(info.appPath);
    // The runner as the launcher runs it, with the alias replaced by a fake opener that records how it was called
    fs.writeFileSync(path.join(info.appPath, 'zh.json'), JSON.stringify({ ...config, cmd: process.execPath, args: [fakeOpener(root, record), ...config.args], runningPattern: path.join(root, 'never-running') }));
    const exited = new Promise<number | null>(resolve => {
      spawn(process.execPath, [path.join(info.appPath, 'zh-runner.js'), path.join(info.appPath, 'zh.json')], { stdio: 'ignore' }).on('exit', resolve);
    });
    const opened = await waitFor(() => readRecord(record)[0]);
    expect(opened.codexHome).toBe(info.codexHome);
    expect(opened.args[0]).toBe(config.args[0]);
    const port = Number(opened.args.find(a => a.startsWith('--remote-debugging-port='))!.replace('--remote-debugging-port=', ''));
    const server = cdpServer(port, (msg, send, close) => {
      if (msg.method === 'Target.setAutoAttach') send({ method: 'Target.attachedToTarget', params: { sessionId: 'S1', targetInfo: { type: 'page', url: 'app://-/index.html' }, waitingForDebugger: true } });
      if (msg.method === 'Runtime.runIfWaitingForDebugger') setTimeout(close, 100);
    });
    await server.ready;
    expect(await exited).toBe(0);
    server.stop();
    const source = server.received.find(m => m.method === 'Page.addScriptToEvaluateOnNewDocument')!.params.source as string;
    const window: any = { __STATSIG__: { instances: {} } };
    new Function('window', source)(window);
    const client: any = {};
    window.__STATSIG__.firstInstance = client;
    client.getLayer = () => ({ get: (key: string) => (key === 'enable_i18n' ? false : 'x') });
    expect(client.getLayer('72216192').get('enable_i18n')).toBe(true);
    expect(fs.readFileSync(path.join(info.appPath, 'zh.log'), 'utf8')).toContain('patched page app://-/index.html');
  });

  test('C-01 没装 Codex 时做不成；图标不是 PNG 时用 Codex 自己的图标', async () => {
    await expect(createWinClone({ ...platform, findCodex: async () => null }, { run, writeShortcut }).make(spec())).rejects.toThrow('没找到 Codex');
    const webp = path.join(root, 'openai.webp');
    fs.writeFileSync(webp, 'RIFFxxxxWEBP');
    const info = await make().make(spec({ slug: 'openai', displayName: 'OpenAI', iconPng: webp }));
    expect(fs.existsSync(path.join(info.appPath, 'icon.ico'))).toBe(false);
    expect(shortcuts.get(path.join(platform.paths.desktopDir, 'OpenAI.lnk'))!.icon).toBe(path.join(location, 'app', 'ChatGPT.exe'));
    const missing = await make().make(spec({ slug: 'qwen', displayName: 'Qwen', iconPng: path.join(root, 'none.png') }));
    expect(fs.existsSync(path.join(missing.appPath, 'icon.ico'))).toBe(false);
  });

  test('C-01 快捷方式建不成时报错，也不算做好了分身（Electron 之外没有 shell）', async () => {
    const clone = createWinClone(platform, { run });
    await expect(clone.make(spec())).rejects.toThrow();
    expect(await clone.list()).toEqual([]);
  });

  test('pngToIco：大图标记 0，非 PNG 返回空；VBS 字符串转义引号', () => {
    const png = fs.readFileSync(logo);
    const big = new Uint8Array(png);
    new DataView(big.buffer).setUint32(16, 512);
    new DataView(big.buffer).setUint32(20, 256);
    const ico = pngToIco(big)!;
    expect([ico[6], ico[7]]).toEqual([0, 0]);
    expect(pngToIco(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(launcherVbs({ slug: 's', name: 'n', exe: 'e', icon: 'i', codexHome: 'C:\\a"b', userData: 'u', zh: false, nodeRunner: 'r' }, 'd')).toContain('"C:\\a""b"');
    expect([...utf16le('a')]).toEqual([0xff, 0xfe, 0x61, 0]);
    // a broken clone.json is ignored by list()
    fs.mkdirSync(path.join(platform.paths.appsDir, 'bad'), { recursive: true });
    fs.writeFileSync(path.join(platform.paths.appsDir, 'bad', 'clone.json'), '{');
    return expect(make().list()).resolves.toEqual([]);
  });
  // K-01, K-02 (platform/clone-home.ts)
  const legacy = () => path.join(root, 'home', '.codex-deepseek');
  const legacyData = () => path.join(root, 'home', 'AppData', 'Roaming', 'Codex (DeepSeek)');

  test('K-01 别人建的 ~/.codex-deepseek 不沿用、不改：分身用 CodexBuddy 自己的目录', async () => {
    fs.mkdirSync(legacy(), { recursive: true });
    fs.writeFileSync(path.join(legacy(), 'config.toml'), 'model = "mine"\n');
    const info = await make({ bornAt: (f: string) => (f === legacy() ? 1 : f === platform.paths.buddyDir ? 2 : null) }).make(spec());
    expect(info.codexHome).toBe(path.join(root, 'home', '.codex-codexbuddy-deepseek'));
    expect(JSON.parse(fs.readFileSync(path.join(info.appPath, 'clone.json'), 'utf8')).userData).toBe(path.join(root, 'home', 'AppData', 'Roaming', 'Codex (CodexBuddy DeepSeek)'));
    expect(fs.existsSync(path.join(info.codexHome, '.codexbuddy-clone'))).toBe(true);
    expect(fs.readdirSync(legacy())).toEqual(['config.toml']);
  });

  test('K-02 旧版 CodexBuddy 建的 ~/.codex-deepseek 分身继续沿用；比 CodexBuddy 还早的不算', async () => {
    let legacyBorn = 5;
    const clone = make({ bornAt: (f: string) => (f === legacy() ? legacyBorn : f === platform.paths.buddyDir ? 2 : null) });
    const first = await clone.make(spec());
    const metaFile = path.join(first.appPath, 'clone.json');
    fs.writeFileSync(metaFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(metaFile, 'utf8')), codexHome: legacy(), userData: legacyData() }));
    fs.mkdirSync(path.join(legacy(), 'sessions'), { recursive: true });
    expect((await clone.list())[0]).toMatchObject({ codexHome: legacy(), ownsHome: true });
    expect((await clone.make(spec())).codexHome).toBe(legacy());
    expect(JSON.parse(fs.readFileSync(metaFile, 'utf8')).userData).toBe(legacyData());
    // The same older clone, but the folder predates CodexBuddy: someone else's
    fs.rmSync(path.join(legacy(), '.codexbuddy-clone'));
    legacyBorn = 1;
    expect((await clone.list())[0]).toMatchObject({ ownsHome: false });
    expect((await clone.make(spec())).codexHome).toBe(path.join(root, 'home', '.codex-codexbuddy-deepseek'));
  });
});
