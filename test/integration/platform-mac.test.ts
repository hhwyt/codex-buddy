// L2: Mac platform against a temp sandbox. Never touches /Applications, the real ~/.codex or the real Codex app.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { GuardError } from '../../electron/core/guard';
import {
  MAC_CODEX_APP, MAC_CODEX_DMG_URL, createMacPlatform, downloadUrlFromEnv, macCli, macCodexAppPath, macPaths, plistValue,
  realExec, resumableDownload, type Exec,
} from '../../electron/platform/mac';
import { sandboxExec, sandboxPaths } from '../../electron/platform/sandbox';
import type { Paths } from '../../electron/platform/types';

const plist = (id: string, version = '26.1.0') =>
  `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string>` +
  `<key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>`;

function makeApp(dir: string, id = 'local.codexbuddy.test-chatgpt', version = '26.1.0') {
  fs.mkdirSync(path.join(dir, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Contents', 'Info.plist'), plist(id, version));
  fs.writeFileSync(path.join(dir, 'Contents', 'MacOS', 'ChatGPT'), 'bin');
}

/** Hash of every file under dir (G-01) */
function hashTree(dir: string): string {
  const h = createHash('sha256');
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d).sort()) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else h.update(p).update(fs.readFileSync(p));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return h.digest('hex');
}

let root: string;
let paths: Paths;
let calls: string[][];
let running: boolean;
let attachFails: boolean;
let dmgApp: string;
let codesignVerifyCode: number | null;
let codesignTeamId: string | null;

/** Fake hdiutil / ditto / pgrep / open / plutil */
const fakeExec: Exec = async (cmd, args) => {
  calls.push([path.basename(cmd), ...args]);
  const name = path.basename(cmd);
  if (name === 'pgrep') return { code: running ? 0 : 1, stdout: '' };
  if (name === 'hdiutil' && args[0] === 'attach') {
    if (attachFails) return { code: 1, stdout: '' };
    const mnt = args[args.indexOf('-mountpoint') + 1];
    fs.cpSync(dmgApp, path.join(mnt, 'ChatGPT.app'), { recursive: true });
    return { code: 0, stdout: '' };
  }
  if (name === 'hdiutil') { fs.rmSync(args[1], { recursive: true, force: true }); return { code: 0, stdout: '' }; }
  if (name === 'codesign' && args[0] === '--verify') return { code: codesignVerifyCode ?? 0, stdout: '' };
  if (name === 'codesign' && args[0] === '-dv') return { code: 0, stdout: `TeamIdentifier=${codesignTeamId ?? '2DC432GLL2'}\n` };
  if (name === 'ditto') { fs.cpSync(args[0], args[1], { recursive: true }); return { code: 0, stdout: '' }; }
  if (name === 'plutil') return { code: 1, stdout: '' };
  return { code: 0, stdout: '' };
};

/** Fake download source with Range support; can drop the connection after N bytes */
const payload = Buffer.alloc(200_000, 7);
let server: http.Server;
let url: string;
let cutAfter: number | null;
let failStatus: number | null;
let requests: { range?: string }[];

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-mac-'));
  paths = sandboxPaths(root, 'mac');
  calls = []; running = false; attachFails = false; cutAfter = null; failStatus = null; requests = [];
  codesignVerifyCode = null; codesignTeamId = null;
  dmgApp = path.join(root, 'dmg-src', 'ChatGPT.app');
  makeApp(dmgApp);
  server = http.createServer((req, res) => {
    requests.push({ range: req.headers.range });
    if (failStatus) { res.writeHead(failStatus); res.end(); return; }
    const m = /bytes=(\d+)-/.exec(req.headers.range || '');
    const start = m ? Number(m[1]) : 0;
    if (start >= payload.length) { res.writeHead(416); res.end(); return; }
    res.writeHead(m ? 206 : 200, { 'Content-Length': payload.length - start });
    const body = payload.subarray(start);
    if (cutAfter !== null) { res.write(body.subarray(0, cutAfter)); setTimeout(() => res.destroy(), 50); return; }
    res.end(body);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/Codex.dmg`;
});

afterEach(async () => {
  await new Promise(r => server.close(r));
  fs.rmSync(root, { recursive: true, force: true });
});

const platform = () => createMacPlatform(paths, { exec: fakeExec, downloadUrl: url });
const app = () => macCodexAppPath(paths);

test('O-02 沙盒里 Codex 装成 <沙盒>/Applications/Test-ChatGPT.app，真机路径是 /Applications/ChatGPT.app', () => {
  expect(app()).toBe(path.join(root, 'Applications', 'Test-ChatGPT.app'));
  expect(macCodexAppPath(macPaths('/Users/x'))).toBe(path.normalize(MAC_CODEX_APP));
  expect(macCli(MAC_CODEX_APP)).toBe(path.normalize('/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'));
  const real = macPaths('/Users/x');
  expect(real.cloneHome('kimi')).toBe(path.join('/Users/x', '.codex-kimi'));
  expect(real.protectedRoots().appDataDirs).toEqual([path.join('/Users/x', 'Library', 'Application Support', 'Codex')]);
});

test('O-02 已经装了 Codex：读出版本，直接算已装好，不下载不覆盖', async () => {
  makeApp(app(), 'local.codexbuddy.test-chatgpt', '26.5.1');
  const p = platform();
  expect(await p.findCodex()).toEqual({ version: '26.5.1', location: app(), cli: macCli(app()), running: false });
  const events: string[] = [];
  expect(await p.installCodex(e => events.push(`${e.id}:${e.state}`))).toEqual({ ok: true });
  expect(events).toEqual(['download:done']);
  expect(requests).toHaveLength(0);
});

test('O-02 读不出 bundle id 当作已装，不覆盖', async () => {
  fs.mkdirSync(path.join(app(), 'Contents'), { recursive: true });
  const p = platform();
  expect(await p.findCodex()).toMatchObject({ version: '', location: app() });
  expect(await p.installCodex(() => {})).toEqual({ ok: true });
  fs.writeFileSync(path.join(app(), 'Contents', 'Info.plist'), 'bplist00garbage');
  expect(await p.findCodex()).toMatchObject({ location: app() });
});

test('O-02 同名但不是 Codex 的 App：不算装好，也不覆盖', async () => {
  makeApp(app(), 'com.openai.chat');
  const p = platform();
  expect(await p.findCodex()).toBeNull();
  expect(await p.installCodex(() => {})).toEqual({ ok: false, reason: '应用程序里已有同名的 App，没有覆盖它' });
  expect(fs.readFileSync(path.join(app(), 'Contents', 'Info.plist'), 'utf8')).toContain('com.openai.chat');
});

test('O-01 开始安装：下载、装进应用程序、检查，依次打勾', async () => {
  const p = platform();
  const events: string[] = [];
  expect(await p.findCodex()).toBeNull();
  expect(await p.installCodex(e => events.push(`${e.id}:${e.state}`))).toEqual({ ok: true });
  expect(events.filter((e, i) => e !== events[i - 1])).toEqual(['download:start', 'download:done', 'copy:start', 'copy:done', 'check:start', 'check:done']);
  expect(await p.findCodex()).toMatchObject({ location: app(), version: '26.1.0' });
  expect(fs.existsSync(path.join(paths.buddyDir, 'downloads', 'Codex.dmg'))).toBe(false);
  expect(fs.existsSync(`${app()}.partial`)).toBe(false);
  expect(calls.some(c => c[0] === 'hdiutil' && c[1] === 'detach')).toBe(true);
});

test('S-09 下载的 Codex 装之前核对签名：通过才继续复制', async () => {
  const p = platform();
  expect(await p.installCodex(() => {})).toEqual({ ok: true });
  expect(calls.some(c => c[0] === 'codesign' && c[1] === '--verify')).toBe(true);
  expect(calls.some(c => c[0] === 'codesign' && c[1] === '-dv')).toBe(true);
  expect(calls.some(c => c[0] === 'ditto')).toBe(true);
  expect(fs.existsSync(app())).toBe(true);
});

test('S-09 codesign --verify 失败：不复制，报「下载的 Codex 签名不对，没有安装」', async () => {
  codesignVerifyCode = 1;
  const p = platform();
  expect(await p.installCodex(() => {})).toEqual({ ok: false, reason: '下载的 Codex 签名不对，没有安装' });
  expect(calls.some(c => c[0] === 'ditto')).toBe(false);
  expect(fs.existsSync(app())).toBe(false);
});

test('S-09 TeamIdentifier 不是 OpenAI 的：不复制', async () => {
  codesignTeamId = 'AAAAAAAAAA';
  const p = platform();
  expect(await p.installCodex(() => {})).toEqual({ ok: false, reason: '下载的 Codex 签名不对，没有安装' });
  expect(calls.some(c => c[0] === 'ditto')).toBe(false);
  expect(fs.existsSync(app())).toBe(false);
});

test('O-03 下载失败 → 故障，再试一次接着装好', async () => {
  failStatus = 500;
  const p = platform();
  const events: string[] = [];
  expect(await p.installCodex(e => events.push(`${e.id}:${e.state}:${e.text}`))).toEqual({ ok: false, reason: '下载没成功，检查一下网络再试' });
  expect(events.at(-1)).toBe('download:fail:下载没成功，检查一下网络再试');
  failStatus = null;
  expect(await p.installCodex(() => {})).toEqual({ ok: true });
});

test('O-03 装进应用程序失败 → 故障；坏的安装包会重下，再试一次装好', async () => {
  attachFails = true;
  const p = platform();
  expect(await p.installCodex(() => {})).toEqual({ ok: false, reason: '没能装进应用程序' });
  expect(fs.existsSync(path.join(paths.buddyDir, 'downloads', 'Codex.dmg'))).toBe(false);
  attachFails = false;
  expect(await p.installCodex(() => {})).toEqual({ ok: true });
});

test('O-03 安装包里没有 App、复制失败、装好的打不开，都报故障', async () => {
  const noApp: Exec = async (cmd, args) => (path.basename(cmd) === 'hdiutil' && args[0] === 'attach' ? { code: 0, stdout: '' } : fakeExec(cmd, args));
  expect(await createMacPlatform(paths, { exec: noApp, downloadUrl: url }).installCodex(() => {})).toEqual({ ok: false, reason: '没能装进应用程序' });
  const dittoFails: Exec = async (cmd, args) => (path.basename(cmd) === 'ditto' ? { code: 1, stdout: '' } : fakeExec(cmd, args));
  expect(await createMacPlatform(paths, { exec: dittoFails, downloadUrl: url }).installCodex(() => {})).toEqual({ ok: false, reason: '没能装进应用程序' });
  fs.rmSync(dmgApp, { recursive: true });
  makeApp(dmgApp, 'com.example.other');
  const events: string[] = [];
  expect(await platform().installCodex(e => events.push(`${e.id}:${e.state}`))).toEqual({ ok: false, reason: '装好的 Codex 打不开' });
  expect(events.at(-1)).toBe('check:fail');
});

test('O-07 安装中途断了再打开：已下载的部分不重下，从断点接着下', async () => {
  const file = path.join(root, 'dl', 'Codex.dmg');
  cutAfter = 50_000;
  await expect(resumableDownload(url, file, fetch)).rejects.toThrow();
  const partSize = fs.statSync(`${file}.part`).size;
  expect(partSize).toBeGreaterThan(0);
  cutAfter = null;
  await resumableDownload(url, file, fetch);
  expect(requests.at(-1)!.range).toBe(`bytes=${partSize}-`);
  expect(fs.readFileSync(file).equals(payload)).toBe(true);
  // Finished file: no request at all
  const n = requests.length;
  await resumableDownload(url, file, fetch);
  expect(requests).toHaveLength(n);
});

test('下载 Codex 时圆环跟着走：报整份文件的百分比，续传从已下的那部分起步', async () => {
  const file = path.join(root, 'dl', 'Codex.dmg');
  cutAfter = 50_000;
  const first: number[] = [];
  await expect(resumableDownload(url, file, fetch, p => first.push(p))).rejects.toThrow();
  expect(first[0]).toBe(0);
  cutAfter = null;
  const second: number[] = [];
  await resumableDownload(url, file, fetch, p => second.push(p));
  expect(second[0]).toBeGreaterThan(0);
  expect(second.at(-1)).toBe(100);
  expect([...second].sort((a, b) => a - b)).toEqual(second);
});

test('O-07 断点已经是完整文件（服务器回 416）直接算下完；服务器不支持续传就从头下', async () => {
  const file = path.join(root, 'dl', 'Codex.dmg');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.part`, payload);
  await resumableDownload(url, file, fetch);
  expect(fs.readFileSync(file).equals(payload)).toBe(true);
  const file2 = path.join(root, 'dl2', 'Codex.dmg');
  fs.mkdirSync(path.dirname(file2), { recursive: true });
  fs.writeFileSync(`${file2}.part`, 'junk');
  const noRange: typeof fetch = (u, init) => fetch(u, { ...init, headers: {} });
  await resumableDownload(url, file2, noRange);
  expect(fs.readFileSync(file2).equals(payload)).toBe(true);
});

test('M-16 Codex 被删了：找不到 Codex', async () => {
  makeApp(app());
  const p = platform();
  expect(await p.findCodex()).not.toBeNull();
  fs.rmSync(app(), { recursive: true });
  expect(await p.findCodex()).toBeNull();
});

test('M-21 只看 Codex 开没开，不替用户关', async () => {
  makeApp(app());
  const p = platform();
  expect(await p.isCodexRunning()).toBe(false);
  running = true;
  expect(await p.isCodexRunning()).toBe(true);
  expect((await p.findCodex())!.running).toBe(true);
  expect(calls.every(c => c[0] !== 'kill' && c[0] !== 'osascript')).toBe(true);
});

test('S-02 在访达里显示；打开 Codex（汉化版有就开汉化版）', async () => {
  makeApp(app());
  const p = platform();
  await p.revealInFolder('/tmp/x/secrets.json');
  expect(calls.at(-1)).toEqual(['open', '-R', '/tmp/x/secrets.json']);
  await p.openCodex({ zh: true });
  expect(calls.at(-1)).toEqual(['open', app()]);
  fs.mkdirSync(paths.zhLauncherPath, { recursive: true });
  await p.openCodex({ zh: true });
  expect(calls.at(-1)).toEqual(['open', paths.zhLauncherPath]);
  await p.openCodex({ zh: false });
  expect(calls.at(-1)).toEqual(['open', app()]);
});

test('G-01 还原：原来就有的 Codex 不卸，数据目录哈希不变', async () => {
  makeApp(app());
  fs.mkdirSync(paths.codexHome, { recursive: true });
  fs.writeFileSync(path.join(paths.codexHome, 'config.toml'), 'model = "x"');
  const before = hashTree(paths.home);
  expect(await platform().uninstallCodex()).toEqual({ ok: true });
  expect(fs.existsSync(app())).toBe(true);
  expect(hashTree(paths.home)).toBe(before);
});

test('G-01 还原：我们装的 Codex 卸掉，~/.codex 和 Codex 数据目录一字不动；Codex 开着时不卸', async () => {
  const p = platform();
  expect(await p.installCodex(() => {})).toEqual({ ok: true });
  fs.mkdirSync(path.join(paths.codexHome, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(paths.codexHome, 'sessions', 'a.jsonl'), 'chat');
  fs.mkdirSync(paths.codexAppDataDirs[0], { recursive: true });
  fs.writeFileSync(path.join(paths.codexAppDataDirs[0], 'Local State'), '{}');
  const data = () => hashTree(paths.codexHome) + hashTree(paths.codexAppDataDirs[0]);
  const before = data();
  running = true;
  expect(await p.uninstallCodex()).toEqual({ ok: false, reason: '先退出 Codex 再还原' });
  expect(fs.existsSync(app())).toBe(true);
  running = false;
  expect(await p.uninstallCodex()).toEqual({ ok: true });
  expect(fs.existsSync(app())).toBe(false);
  expect(data()).toBe(before);
  expect(await p.uninstallCodex()).toEqual({ ok: true });
});

test('G-01 删除都经过 guard：Codex 路径指向数据目录时拒绝删除', async () => {
  const evil: Paths = { ...paths, appsDir: paths.home };
  const p = createMacPlatform({ ...evil, appsDir: path.join(paths.codexHome) }, { exec: fakeExec, downloadUrl: url });
  makeApp(path.join(paths.codexHome, 'ChatGPT.app'));
  fs.mkdirSync(paths.buddyDir, { recursive: true });
  fs.writeFileSync(path.join(paths.buddyDir, 'installed-codex.json'), '{}');
  await expect(p.uninstallCodex()).rejects.toThrow(GuardError);
  expect(fs.existsSync(path.join(paths.codexHome, 'ChatGPT.app'))).toBe(true);
});

test('O-01 下载地址：默认官方，CODEXBUDDY_ENDPOINTS 可以指到假下载源', () => {
  expect(downloadUrlFromEnv({})).toBe(MAC_CODEX_DMG_URL);
  expect(downloadUrlFromEnv({ CODEXBUDDY_ENDPOINTS: '{"codexDownload":"http://127.0.0.1:1/x.dmg"}' })).toBe('http://127.0.0.1:1/x.dmg');
  expect(downloadUrlFromEnv({ CODEXBUDDY_ENDPOINTS: 'not json' })).toBe(MAC_CODEX_DMG_URL);
});

test('O-02 二进制 Info.plist 用 plutil 读', async () => {
  const f = path.join(root, 'Info.plist');
  fs.writeFileSync(f, 'bplist00');
  expect(await plistValue(f, 'CFBundleIdentifier', async () => ({ code: 0, stdout: 'com.openai.codex\n' }))).toBe('com.openai.codex');
  expect(await plistValue(f, 'CFBundleIdentifier', async () => ({ code: 0, stdout: '' }))).toBeNull();
  expect(await plistValue(path.join(root, 'none'), 'X', fakeExec)).toBeNull();
});

test('S-02 沙盒里不真的打开 App，只记下来', async () => {
  const log = path.join(root, 'log', 'open.log');
  const ex = sandboxExec(log, async () => ({ code: 7, stdout: 'real' }));
  expect(await ex('/usr/bin/open', ['-R', '/x'])).toEqual({ code: 0, stdout: '' });
  expect(await ex('/usr/bin/pgrep', ['-f', 'x'])).toEqual({ code: 7, stdout: 'real' });
  expect(fs.readFileSync(log, 'utf8')).toBe('["/usr/bin/open","-R","/x"]\n');
  // Default platform in a sandbox uses it
  const p = createMacPlatform(paths, { downloadUrl: url });
  await p.revealInFolder(path.join(root, 'y'));
  expect(fs.readFileSync(path.join(paths.buddyDir, 'sandbox-open.log'), 'utf8')).toContain('"-R"');
  expect(await p.isCodexRunning()).toBe(false);
  expect(p.os).toBe('mac');
});

test.runIf(process.platform === 'darwin')('O-01 真的 hdiutil 和 ditto：从假下载源的 dmg 装进沙盒', async () => {
  const src = path.join(root, 'dmgroot');
  makeApp(path.join(src, 'Test-ChatGPT.app'), 'local.codexbuddy.test-chatgpt', '27.0.0');
  const dmgFile = path.join(root, 'real.dmg');
  execFileSync('/usr/bin/hdiutil', ['create', '-quiet', '-fs', 'HFS+', '-srcfolder', src, '-volname', 'Codex', dmgFile]);
  const bytes = fs.readFileSync(dmgFile);
  const s = http.createServer((_q, r) => { r.writeHead(200, { 'Content-Length': bytes.length }); r.end(bytes); });
  await new Promise<void>(r => s.listen(0, '127.0.0.1', r));
  // The fixture app is unsigned: let codesign pretend it's OpenAI's so this test keeps exercising the real dmg copy path.
  const execRealWithFakeCodesign: Exec = async (cmd, args) => {
    if (path.basename(cmd) === 'codesign') {
      if (args[0] === '--verify') return { code: 0, stdout: '' };
      if (args[0] === '-dv') return { code: 0, stdout: 'TeamIdentifier=2DC432GLL2\n' };
    }
    return realExec(cmd, args);
  };
  const p = createMacPlatform(paths, { exec: execRealWithFakeCodesign, downloadUrl: `http://127.0.0.1:${(s.address() as AddressInfo).port}/Codex.dmg` });
  expect(await p.installCodex(() => {})).toEqual({ ok: true });
  expect(await p.findCodex()).toMatchObject({ version: '27.0.0', location: app(), running: false });
  await new Promise(r => s.close(r));
}, 60_000);

test('G-01 沙盒路径：所有路径都在沙盒里（Mac 和 Windows）', async () => {
  const { sandboxRoot } = await import('../../electron/platform/sandbox');
  expect(sandboxRoot({ CODEXBUDDY_SANDBOX: root })).toBe(root);
  expect(sandboxRoot({})).toBeNull();
  for (const o of ['mac', 'win'] as const) {
    const p = sandboxPaths(root, o);
    for (const v of [p.home, p.codexHome, p.cloneHome('kimi'), p.appsDir, p.buddyDir, ...p.codexAppDataDirs, p.desktopDir, p.startMenuDir, p.zhLauncherPath]) {
      expect(v.startsWith(root)).toBe(true);
    }
    expect(p.protectedRoots().codexHome).toBe(p.codexHome);
  }
  expect(sandboxPaths(root).appsDir.startsWith(root)).toBe(true);
});

test.skipIf(process.platform === 'win32')('R-01 runCodex 用沙盒里 Codex 自带的命令行，CODEX_HOME 指到给定目录', async () => {
  const cli = macCli(app());
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.mkdirSync(paths.codexHome, { recursive: true });
  if (process.platform === 'win32') fs.copyFileSync(process.execPath, cli);
  else fs.symlinkSync(process.execPath, cli);
  const r = await platform().runCodex(['-e', 'console.log("home=" + process.env.CODEX_HOME)'], { codexHome: paths.codexHome, timeoutMs: 5000 });
  expect(r.out.trim()).toBe(`home=${paths.codexHome}`);
});


test('M-21 Mac 先退出对应安装路径的应用，再按语言设置重新打开', async () => {
  makeApp(app());
  running = true;
  const platform = createMacPlatform(paths, { exec: async (command, args) => {
    const result = await fakeExec(command, args);
    if (command.endsWith('/osascript')) running = false;
    if (command.endsWith('/open')) running = true;
    return result;
  } });
  await platform.restartCodex({ zh: false });
  const quit = calls.findIndex(c => c[0] === 'osascript');
  const opened = calls.findIndex(c => c[0] === 'open');
  expect(quit).toBeGreaterThan(-1);
  expect(calls[quit].at(-1)).toBe(app());
  expect(opened).toBeGreaterThan(quit);
  expect(calls[opened]).toEqual(['open', app()]);
  expect(calls.some(c => c[0] === 'pkill' || c[0] === 'killall')).toBe(false);
});

test('M-21 Mac 无法退出时不启动应用，打开失败也返回失败', async () => {
  makeApp(app());
  running = true;
  const platform = createMacPlatform(paths, { exec: async (command, args) => command.endsWith('/osascript') ? { code: 1, stdout: '' } : fakeExec(command, args) });
  await expect(platform.restartCodex({ zh: false })).rejects.toThrow('没能退出 ChatGPT');
  expect(calls.some(c => c[0] === 'open')).toBe(false);
  running = false;
  const brokenOpen = createMacPlatform(paths, { exec: async (command, args) => command.endsWith('/open') ? { code: 1, stdout: '' } : fakeExec(command, args) });
  await expect(brokenOpen.restartCodex({ zh: false })).rejects.toThrow('没能重新打开 ChatGPT');
});
