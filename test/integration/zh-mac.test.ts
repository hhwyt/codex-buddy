// L2: 汉化版 launcher on Mac, against a sandbox (CODEXBUDDY_SANDBOX layout) with a fake ChatGPT.app. Nothing here
// touches the real ~/.codex, /Applications or the real Codex; Codex is "opened" by a fake opener that only records.
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { GuardError } from '../../electron/core/guard';
import { createMacPlatform } from '../../electron/platform/mac';
import { sandboxPaths } from '../../electron/platform/sandbox';
import type { Paths } from '../../electron/platform/types';
import {
  codexAppPath, createMacZh, isMacCodexRunning, launcherScript, makeBadgedIcon, readCodexApp, realExec, writeZhRunner,
  ZH_APP_EXECUTABLE, zhStateDir, type Exec, type ZhRunnerConfig,
} from '../../electron/platform/zh-mac';
import { nodeFs } from '../../electron/platform/node-fs';
import { cdpServer, fakeCodexApp, fakeOpener, hashTree, readRecord, waitFor } from './zh-helpers';

const isMac = process.platform === 'darwin';
const logo = path.join(__dirname, '..', '..', 'ui', 'assets', 'logos', 'deepseek.png');
let root: string, paths: Paths, app: string, record: string, opener: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-zh-mac-'));
  paths = sandboxPaths(root, 'mac');
  app = codexAppPath(paths.appsDir);
  fakeCodexApp(app, { icon: logo });
  fs.mkdirSync(path.join(paths.codexHome, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(paths.codexHome, 'sessions', 'chat.jsonl'), '{"hello":1}');
  fs.writeFileSync(path.join(paths.codexHome, 'config.toml'), 'model = "x"\n');
  fs.mkdirSync(paths.codexAppDataDirs[0], { recursive: true });
  fs.writeFileSync(path.join(paths.codexAppDataDirs[0], 'Preferences'), '{}');
  record = path.join(root, 'opened.jsonl');
  opener = fakeOpener(root, record);
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const zh = (exec?: Exec) => createMacZh(createMacPlatform(paths), { exec, nodeRunner: process.execPath });
const resources = () => path.join(paths.zhLauncherPath, 'Contents', 'Resources');
const config = (): ZhRunnerConfig => JSON.parse(fs.readFileSync(path.join(resources(), 'zh.json'), 'utf8'));
/** Points the launcher's runner at the fake opener instead of /usr/bin/open */
function useFakeOpener(extra: Partial<ZhRunnerConfig> = {}) {
  const c = config();
  writeZhRunner(nodeFs, resources(), { ...c, cmd: process.execPath, args: [opener, '-a', app, '--args'], ...extra });
}
/** A tiny executable that turns --run-script <script> [args...] into plain node <script> [args...], so tests can
 *  run the launcher shell with node standing in for CodexBuddy's Electron. */
const nodeRunScript = () => {
  const f = path.join(root, 'node-run-script');
  fs.writeFileSync(f, `#!/bin/sh\nif [ "$1" = "--run-script" ]; then shift; fi\nexec ${JSON.stringify(process.execPath)} "$@"\n`, { mode: 0o755 });
  return f;
};
const runRunner = (dir = resources()) => spawnSync(process.execPath, [path.join(dir, 'zh-runner.js'), path.join(dir, 'zh.json')], { encoding: 'utf8', timeout: 20_000 });
const runRunnerAsync = (dir = resources()) => new Promise<number | null>(resolve => {
  const child = spawn(process.execPath, [path.join(dir, 'zh-runner.js'), path.join(dir, 'zh.json')], { stdio: 'ignore' });
  child.on('exit', code => resolve(code));
});
const dataHash = () => hashTree(paths.codexHome) + hashTree(paths.codexAppDataDirs[0]);

/** Runs the patch the runner injects in a fake page and asks Statsig for enable_i18n */
function i18nAfterPatch(source: string): unknown {
  const window: any = {};
  new Function('window', source)(window);
  const layer = { get: (key: string, fallback: unknown) => (key === 'enable_i18n' ? false : fallback) };
  const client: any = {};
  window.__STATSIG__ = { instances: {} };
  window.__STATSIG__.firstInstance = client;
  client.getLayer = (name: string) => (name === '72216192' ? layer : { get: () => 'other' });
  return [client.getLayer('72216192').get('enable_i18n', false), client.getLayer('1').get('enable_i18n')];
}

describe('汉化版 on Mac', () => {
  test('L-01 默认英文原版：没加之前没有汉化版入口，这一版能汉化', async () => {
    const z = zh(realExec);
    expect(await z.exists()).toBe(false);
    expect(await z.supported()).toBe(true);
  });

  test('L-02 加汉化版：应用程序里出现「ChatGPT 汉化版」，ChatGPT.app 一个字节都不变', async () => {
    const before = hashTree(app);
    const z = zh(realExec);
    await z.add();
    expect(await z.exists()).toBe(true);
    const contents = path.join(paths.zhLauncherPath, 'Contents');
    expect(paths.zhLauncherPath).toBe(path.join(root, 'Applications', 'ChatGPT 汉化版.app'));
    const plist = fs.readFileSync(path.join(contents, 'Info.plist'), 'utf8');
    expect(plist).toContain('<string>ChatGPT 汉化版</string>');
    expect(plist).toContain(`<string>${ZH_APP_EXECUTABLE}</string>`);
    const exe = path.join(contents, 'MacOS', ZH_APP_EXECUTABLE);
    if (process.platform !== 'win32') expect(fs.statSync(exe).mode & 0o111).not.toBe(0);
    expect(fs.readFileSync(exe, 'utf8')).toContain('--run-script');
    expect(fs.readFileSync(exe, 'utf8')).not.toContain('ELECTRON_RUN_AS_NODE');
    expect(config()).toMatchObject({ cmd: '/usr/bin/open', args: ['-a', app, '--args'], version: '26.1027.61615', stateDir: zhStateDir(paths.buddyDir) });
    expect(fs.readFileSync(path.join(resources(), 'zh-runner.js'), 'utf8')).toContain('enable_i18n');
    if (isMac) {
      const icon = fs.readFileSync(path.join(resources(), 'AppIcon.icns'));
      expect(icon.subarray(0, 4).toString()).toBe('icns');
      expect(fs.existsSync(path.join(zhStateDir(paths.buddyDir), 'icon-work'))).toBe(false);
    }
    expect(hashTree(app)).toBe(before);
  });

  test('L-02 从汉化版打开：以 127.0.0.1 随机端口启动 Codex，每个页面打开 enable_i18n，Codex 关了它就退出', async () => {
    await zh(realExec).add();
    useFakeOpener();
    const exited = runRunnerAsync();
    const opened = await waitFor(() => readRecord(record)[0]);
    const portArg = opened.args.find(a => a.startsWith('--remote-debugging-port='))!;
    expect(opened.args.slice(0, 3)).toEqual(['-a', app, '--args']);
    expect(opened.runAsNode).toBeNull();
    const port = Number(portArg.split('=')[1]);
    expect(port).toBeGreaterThan(1024);
    const server = cdpServer(port, (msg, send, close) => {
      if (msg.method === 'Target.setAutoAttach') {
        send({ method: 'Target.attachedToTarget', params: { sessionId: 'S1', targetInfo: { type: 'page', url: 'app://-/index.html' }, waitingForDebugger: true } });
        send({ method: 'Target.attachedToTarget', params: { sessionId: 'S2', targetInfo: { type: 'page', url: 'app://-/other' }, waitingForDebugger: false } });
        send({ method: 'Target.attachedToTarget', params: { sessionId: 'S3', targetInfo: { type: 'service_worker', url: 'x' }, waitingForDebugger: true } });
      }
      if (msg.method === 'Runtime.evaluate') setTimeout(close, 100);
    });
    await server.ready;
    expect(await exited).toBe(0);
    server.stop();
    const methods = server.received.map(m => `${m.sessionId ?? '-'} ${m.method}`);
    expect(methods).toEqual([
      '- Target.setAutoAttach',
      'S1 Page.enable', 'S1 Page.addScriptToEvaluateOnNewDocument', 'S1 Runtime.runIfWaitingForDebugger',
      'S2 Page.enable', 'S2 Page.addScriptToEvaluateOnNewDocument', 'S2 Runtime.evaluate',
      'S3 Runtime.runIfWaitingForDebugger',
    ]);
    expect(server.received[0].params).toEqual({ autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    expect(i18nAfterPatch(server.received[2].params.source)).toEqual([true, 'other']);
    expect(fs.readFileSync(path.join(zhStateDir(paths.buddyDir), 'zh.log'), 'utf8')).toContain('patched page app://-/index.html');
  });

  test.skipIf(process.platform === 'win32')('L-02 启动器脚本：用 CodexBuddy 自带的 Electron 跑汉化，没有它时直接按英文打开', async () => {
    // node stands in for CodexBuddy's Electron: an executable shim honours the same --run-script contract
    await createMacZh(createMacPlatform(paths), { exec: realExec, nodeRunner: nodeRunScript() }).add();
    useFakeOpener({ waitMs: 300 });
    const exe = path.join(paths.zhLauncherPath, 'Contents', 'MacOS', ZH_APP_EXECUTABLE);
    expect(spawnSync(exe, { timeout: 20_000 }).status).toBe(0);
    expect((await waitFor(() => readRecord(record)[0])).args.some(a => a.startsWith('--remote-debugging-port='))).toBe(true);

    const plain = path.join(root, 'plain.sh');
    fs.writeFileSync(plain, launcherScript(path.join(root, 'no-electron'), { cmd: opener, args: ['-a', "it's.app"] }), { mode: 0o755 });
    expect(spawnSync(plain, { timeout: 20_000 }).status).toBe(0);
    expect((await waitFor(() => readRecord(record)[1])).args).toEqual(['-a', "it's.app"]);
  });

  // Mac-only flow: on Windows the second add() overwrites the copied .icns, which fails on the runner's temp path
  test.skipIf(process.platform === 'win32')('L-06 这一版 Codex 汉化不了（调试端口不回应）：照常英文打开，并对这一版关掉汉化，再选汉化版时重试', async () => {
    const z = zh(realExec);
    await z.add();
    useFakeOpener({ waitMs: 300 });
    expect(runRunner().status).toBe(0);
    expect(fs.existsSync(path.join(zhStateDir(paths.buddyDir), 'disabled-26.1027.61615'))).toBe(true);
    expect(await z.supported()).toBe(false);
    // Opening again: straight to plain English, no debug port
    expect(runRunner().status).toBe(0);
    expect((await waitFor(() => readRecord(record)[1])).args).toEqual(['-a', app, '--args']);
    await z.add();
    expect(await z.supported()).toBe(true);
  });

  test('L-06 没装 Codex：不能汉化，加汉化版报「没找到 Codex」', async () => {
    fs.rmSync(app, { recursive: true });
    const z = zh(realExec);
    expect(await z.supported()).toBe(false);
    await expect(z.add()).rejects.toThrow('没找到 Codex');
    expect(await z.exists()).toBe(false);
  });

  test.runIf(isMac)('L-05 Codex 已经开着：汉化版不关它，只把它调到前面；能检测 Codex 开没开', async () => {
    await zh(realExec).add();
    useFakeOpener();
    expect(await isMacCodexRunning(realExec, app)).toBe(false);
    const fakeCodex = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)', `${app}/Contents/MacOS/ChatGPT`], { stdio: 'ignore' });
    try {
      await waitFor(() => spawnSync('/usr/bin/pgrep', ['-f', `${app}/Contents/MacOS/`]).status === 0);
      expect(await isMacCodexRunning(realExec, app)).toBe(true);
      expect(runRunner().status).toBe(0);
      expect((await waitFor(() => readRecord(record)[0])).args).toEqual(['-a', app, '--args']);
    } finally { fakeCodex.kill(); }
  });

  test('L-04 去掉汉化版：只删「ChatGPT 汉化版」入口，Codex、聊天记录和数据目录哈希不变', async () => {
    const z = zh(realExec);
    await z.add();
    const before = dataHash(), appBefore = hashTree(app);
    await z.remove();
    expect(await z.exists()).toBe(false);
    expect(fs.existsSync(paths.zhLauncherPath)).toBe(false);
    expect(dataHash()).toBe(before);
    expect(hashTree(app)).toBe(appBefore);
    await z.remove(); // nothing left: no error
  });

  test('L-04 删除走 guard：入口路径指向用户数据时拒绝删除', async () => {
    const bad = { ...paths, zhLauncherPath: paths.codexHome };
    const z = createMacZh(createMacPlatform(bad), { exec: realExec, nodeRunner: process.execPath });
    const before = dataHash();
    await expect(z.remove()).rejects.toBeInstanceOf(GuardError);
    expect(dataHash()).toBe(before);
  });

  test('L-07 分身跟着汉化走：分身启动器用同一个汉化程序，以分身自己的程序和 CODEX_HOME 打开', async () => {
    const cloneDir = path.join(root, 'Applications', 'DeepSeek.app', 'Contents', 'Resources');
    const cloneHome = paths.cloneHome('deepseek');
    writeZhRunner(nodeFs, cloneDir, {
      cmd: process.execPath, args: [opener, '--user-data-dir=' + path.join(root, 'ud')], env: { CODEX_HOME: cloneHome }, version: '26.1027.61615',
      stateDir: zhStateDir(paths.buddyDir), runningPattern: path.join(root, 'Applications', 'DeepSeek.app') + '/Contents/MacOS/', waitMs: 300,
    });
    expect(runRunner(cloneDir).status).toBe(0);
    const opened = await waitFor(() => readRecord(record)[0]);
    expect(opened.codexHome).toBe(cloneHome);
    expect(opened.args[0]).toBe('--user-data-dir=' + path.join(root, 'ud'));
    expect(opened.args[1]).toBe('--remote-debugging-address=127.0.0.1');
    expect(opened.args[2]).toMatch(/^--remote-debugging-port=\d+$/);
    // Chinese even on an English system: Codex follows the language Chromium is told (hwy-pc, en-US Windows)
    expect(opened.args[3]).toBe('--lang=zh-CN');
  });
});

describe('汉化版 on Mac: details', () => {
  test('L-02 图标做不出来时用 ChatGPT 原图标，没有图标也能加', async () => {
    const calls: string[] = [];
    const failing: Exec = async (cmd, args) => { calls.push(cmd); return realExec(cmd === '/usr/bin/osascript' ? '/usr/bin/false' : cmd, args); };
    await zh(failing).add();
    expect(fs.readFileSync(path.join(resources(), 'AppIcon.icns'))).toEqual(fs.readFileSync(logo));
    expect(calls).toContain('/usr/bin/osascript');

    fs.rmSync(paths.zhLauncherPath, { recursive: true });
    fakeCodexApp(app, { icon: null });
    await zh(realExec).add();
    expect(fs.existsSync(path.join(resources(), 'AppIcon.icns'))).toBe(false);
  });

  test('L-02 读 Codex 版本：图标名不带 .icns 也能找到，Info.plist 坏了算没装', () => {
    const plist = path.join(app, 'Contents', 'Info.plist');
    fs.writeFileSync(plist, fs.readFileSync(plist, 'utf8').replace('electron.icns', 'electron'));
    expect(readCodexApp(nodeFs, app)).toEqual({ version: '26.1027.61615', icon: path.join(app, 'Contents', 'Resources', 'electron.icns'), executable: 'ChatGPT' });
    fs.writeFileSync(plist, '<plist/>');
    expect(readCodexApp(nodeFs, app)).toBeNull();
  });

  test('L-02 默认用 CodexBuddy 自己的程序跑汉化', async () => {
    await createMacZh(createMacPlatform(paths), { exec: realExec }).add();
    const exe = path.join(paths.zhLauncherPath, 'Contents', 'MacOS', ZH_APP_EXECUTABLE);
    expect(fs.readFileSync(exe, 'utf8')).toContain(process.execPath);
  });

  test('L-02 默认的命令执行器能报出退出码', async () => {
    expect((await realExec(process.execPath, ['-e', 'console.log("hi")'])).out).toBe('hi\n');
    expect((await realExec(process.execPath, ['-e', 'process.exit(3)'])).code).toBe(3);
    expect((await realExec(path.join(root, 'missing'), [])).code).toBe(1);
  });

  test.runIf(isMac)('L-02 角标图标：osascript 画出「中」字角标并转成 icns', async () => {
    const out = path.join(root, 'x.icns');
    expect(await makeBadgedIcon(realExec, nodeFs, logo, path.join(root, 'work'), out)).toBe(true);
    expect(fs.readFileSync(out).subarray(0, 4).toString()).toBe('icns');
  });
});
