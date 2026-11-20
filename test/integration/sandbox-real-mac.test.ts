// L2: real-Codex test runs on Mac (CODEXBUDDY_SANDBOX + CODEXBUDDY_REAL_CODEX=1): Codex is an APFS copy of the user's
// ChatGPT.app inside the sandbox, with the sandbox's CODEX_HOME and data dir. Real cp -c / plutil / codesign run on a
// fake ChatGPT.app outside the sandbox; `open` and lsregister are recorded instead of run (nothing is launched).
// The safety property tested hardest: "Codex is running" only ever sees processes of the sandbox copy, never the
// user's /Applications/ChatGPT.app; confirmed restarts only address the sandbox copy.
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CLONE_LAUNCHER, runCommand, type CommandRunner } from '../../electron/platform/clone-mac';
import { MAC_CODEX_APP, macPaths, macRunningPattern, realExec, type Exec } from '../../electron/platform/mac';
import { sandboxPaths, TEST_CODEX_BUNDLE_ID } from '../../electron/platform/sandbox';
import { realSandboxMac, SANDBOX_CODEX_NAME } from '../../electron/platform/sandbox-real-mac';

const onMac = process.platform === 'darwin';

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ChatGPT</string>
<key>CFBundleIdentifier</key><string>com.openai.codex</string>
<key>CFBundleName</key><string>ChatGPT</string>
<key>CFBundleDisplayName</key><string>ChatGPT</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>26.1</string>
<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLSchemes</key><array><string>codex</string></array></dict></array>
</dict></plist>
`;
// The fake main executable: records env and args
const FAKE_EXE = '#!/bin/bash\nenv > "$PROBE.env"\nprintf \'%s\\n\' "$@" > "$PROBE.args"\n';
const FAKE_CLI = '#!/bin/bash\necho "codex-cli 0.0.1 $CODEX_HOME"\n';

let root: string;
let sandbox: string;
let userApp: string;
let calls: string[][];
let execs: string[][];
let children: ChildProcess[];

function makeFakeApp(app: string) {
  const cli = path.join(app, 'Contents', 'Resources', 'codex-cli', 'CodexCLI.app', 'Contents', 'MacOS');
  fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
  fs.mkdirSync(cli, { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), INFO_PLIST);
  fs.writeFileSync(path.join(app, 'Contents', 'MacOS', 'ChatGPT'), FAKE_EXE, { mode: 0o755 });
  fs.writeFileSync(path.join(cli, 'codex'), FAKE_CLI, { mode: 0o755 });
}

function digest(dir: string): string {
  const h = crypto.createHash('sha256');
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      h.update(p);
      if (e.isDirectory()) walk(p); else h.update(fs.readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}

/** Real commands, except the ones that would launch or register an app */
const run: CommandRunner = async (cmd, args) => {
  calls.push([cmd, ...args]);
  if (cmd === 'open' || cmd.endsWith('/lsregister')) return '';
  return runCommand(cmd, args);
};
const exec: Exec = async (cmd, args) => {
  execs.push([cmd, ...args]);
  return cmd === '/usr/bin/open' ? { code: 0, stdout: '' } : realExec(cmd, args);
};

const build = () => ({ paths: sandboxPaths(sandbox, 'mac'), ...realSandboxMac(sandboxPaths(sandbox, 'mac'), { run, exec, sourceApp: userApp }) });
const copyApp = () => path.join(sandbox, 'Applications', `${SANDBOX_CODEX_NAME}.app`);
const plist = (app: string, key: string) =>
  execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', path.join(app, 'Contents', 'Info.plist')]).toString().trim();
const install = async () => {
  const events: string[] = [];
  const r = await build().platform.installCodex(e => events.push(`${e.id}:${e.state}:${e.text}`));
  return { r, events };
};
/** A process whose command line looks like a running app binary (a sleeping node with that path as an argument) */
const fakeProcess = (exe: string) => {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)', exe], { stdio: 'ignore' });
  children.push(child);
  return child;
};
const pgrep = (pattern: string) => spawnSync('/usr/bin/pgrep', ['-f', pattern]).stdout.toString().split('\n').filter(Boolean).map(Number);
const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise(r => setTimeout(r, 50));
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-real-mac-'));
  sandbox = path.join(root, 'sandbox');
  userApp = path.join(root, 'user', 'Applications', 'ChatGPT.app');
  makeFakeApp(userApp);
  calls = []; execs = []; children = [];
});
afterEach(() => {
  for (const c of children) c.kill();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('真实 Codex 实测模式（Mac）：运行检测只认沙盒副本', () => {
  test('M-21 「Codex 开着」的匹配式只含沙盒副本自己的路径，正则字符已转义，永远匹配不到站主的 ChatGPT.app', () => {
    const app = copyApp();
    const pattern = new RegExp(macRunningPattern(app));
    expect(pattern.test(`${app}/Contents/MacOS/ChatGPT --user-data-dir=x`)).toBe(true);
    expect(pattern.test(`${MAC_CODEX_APP}/Contents/MacOS/ChatGPT`)).toBe(false);
    expect(pattern.test(`${userApp}/Contents/MacOS/ChatGPT`)).toBe(false);
    // Without escaping, "Test-ChatGPT.app" would also match "Test-ChatGPTxapp"
    expect(pattern.test(app.replace('Test-ChatGPT.app', 'Test-ChatGPTxapp') + '/Contents/MacOS/ChatGPT')).toBe(false);
    expect(macRunningPattern('/a (b)/C+.app')).toBe('/a \\(b\\)/C\\+\\.app/Contents/MacOS/');
  });

  test('M-21 Mac 不使用进程名批量杀进程，退出只允许指定应用路径', () => {
    const dir = path.join(__dirname, '..', '..', 'electron', 'platform');
    for (const file of ['mac.ts', 'sandbox-real-mac.ts', 'clone-mac.ts', 'zh-mac.ts']) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(text, file).not.toMatch(/pkill|killall|process\.kill|\.kill\(|kill -|'kill'|"kill"|quit app/i);
    }
  });
});

describe.runIf(onMac)('真实 Codex 实测模式（Mac，真工具，假 App）', () => {
  test('O-02 安装 = 把站主的 ChatGPT.app 用 APFS 克隆复制进沙盒：自己的名字和 bundle id、ad-hoc 签名，原 App 一个字节不变', async () => {
    const before = digest(userApp);
    const { r, events } = await install();
    expect(r).toEqual({ ok: true });
    expect(events).toEqual(['copy:start:复制一份 Codex 到沙盒', 'copy:done:复制一份 Codex 到沙盒', 'check:done:检查 Codex']);
    const app = copyApp();
    expect(calls).toContainEqual(['cp', '-cR', userApp, app]);
    expect(plist(app, 'CFBundleIdentifier')).toBe(TEST_CODEX_BUNDLE_ID);
    expect(plist(app, 'CFBundleName')).toBe(SANDBOX_CODEX_NAME);
    expect(plist(app, 'CFBundleExecutable')).toBe(CLONE_LAUNCHER);
    expect(() => plist(app, 'CFBundleURLTypes')).toThrow();
    execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
    expect(digest(userApp)).toBe(before);
    // Every write stayed inside the sandbox
    for (const c of calls.filter(x => ['plutil', 'codesign', 'chmod', 'xattr'].includes(x[0]))) expect(c.at(-1)!.startsWith(sandbox), c.join(' ')).toBe(true);

    const { platform, paths } = build();
    expect(await platform.findCodex()).toEqual({
      version: '26.1', location: app, running: false,
      cli: path.join(app, 'Contents', 'Resources', 'codex-cli', 'CodexCLI.app', 'Contents', 'MacOS', 'codex'),
    });
    // Installed already: just ticked, nothing copied again
    calls = [];
    expect(await install()).toEqual({ r: { ok: true }, events: ['download:done:Codex 已装好'] });
    expect(calls).toEqual([]);
    // The CLI used for model checks is the copy's own, with the sandbox's CODEX_HOME
    const out = await platform.runCodex(['--version'], { codexHome: paths.codexHome, timeoutMs: 5000 });
    expect(out.out.trim()).toBe(`codex-cli 0.0.1 ${paths.codexHome}`);
  });

  test('打开沙盒副本：CODEX_HOME 是沙盒的 .codex，数据目录在沙盒里，mock keychain，关掉 Sparkle 自动更新', async () => {
    await install();
    const { platform, paths } = build();
    const app = copyApp();
    await platform.openCodex({ zh: false });
    expect(execs).toContainEqual(['/usr/bin/open', app]);
    // What `open` would start: the bundle's launcher. Run it with the user's own CODEX_HOME set: it must not leak in
    const probe = path.join(root, 'probe');
    execFileSync(path.join(app, 'Contents', 'MacOS', CLONE_LAUNCHER), ['--x'], {
      env: { PATH: process.env.PATH, PROBE: probe, CODEX_HOME: path.join(os.homedir(), '.codex') },
    });
    const env = fs.readFileSync(`${probe}.env`, 'utf8');
    const userData = path.join(paths.home, 'Library', 'Application Support', `Codex (${SANDBOX_CODEX_NAME})`);
    expect(env).toContain(`CODEX_HOME=${paths.codexHome}\n`);
    expect(env).toContain(`CODEX_ELECTRON_USER_DATA_PATH=${userData}\n`);
    expect(env).toContain('CODEX_SPARKLE_ENABLED=false\n');
    expect(fs.readFileSync(`${probe}.args`, 'utf8').split('\n').filter(Boolean)).toEqual([`--user-data-dir=${userData}`, '--use-mock-keychain', '--x']);
    expect(paths.codexHome.startsWith(sandbox) && userData.startsWith(sandbox)).toBe(true);
    await platform.revealInFolder(path.join(paths.buddyDir, 'x'));
    expect(execs).toContainEqual(['/usr/bin/open', '-R', path.join(paths.buddyDir, 'x')]);
  });

  test('L-05 「Codex 开着」只看沙盒副本的进程：站主的 ChatGPT.app 开着也算没开', async () => {
    await install();
    const { platform } = build();
    const app = copyApp();
    // The user's own Codex (real path and the fake source), and a look-alike path that an unescaped pattern would match
    const others = [`${MAC_CODEX_APP}/Contents/MacOS/ChatGPT`, `${userApp}/Contents/MacOS/ChatGPT`, app.replace('Test-ChatGPT.app', 'Test-ChatGPTxapp') + '/Contents/MacOS/ChatGPT'];
    const decoys = others.map(fakeProcess);
    await waitFor(() => decoys.every(d => pgrep('setTimeout').includes(d.pid!)));
    expect(await platform.isCodexRunning()).toBe(false);
    expect((await platform.findCodex())!.running).toBe(false);
    const ours = fakeProcess(`${app}/Contents/MacOS/ChatGPT`);
    await waitFor(() => pgrep(macRunningPattern(app)).length > 0);
    expect(await platform.isCodexRunning()).toBe(true);
    // The pattern CodexBuddy uses sees exactly the sandbox copy's process: never a decoy, never the user's real Codex
    expect(pgrep(macRunningPattern(app))).toEqual([ours.pid]);
    expect(execs.filter(c => c[0] === '/usr/bin/pgrep').every(c => c[2] === macRunningPattern(app))).toBe(true);
    // Running: 还原 refuses instead of closing it
    expect(await platform.uninstallCodex()).toEqual({ ok: false, reason: '先退出 Codex 再还原' });
    expect(decoys.concat(ours).every(c => c.exitCode === null)).toBe(true);
  });

  test('G-01 还原只删 CodexBuddy 复制进沙盒的那份，沙盒的 .codex 留着；站主的 App 不动', async () => {
    await install();
    const { platform, paths } = build();
    fs.writeFileSync(path.join(paths.codexHome, 'config.toml'), 'model = "x"\n');
    const before = digest(userApp);
    expect(await platform.uninstallCodex()).toEqual({ ok: true });
    expect(fs.existsSync(copyApp())).toBe(false);
    expect(fs.readFileSync(path.join(paths.codexHome, 'config.toml'), 'utf8')).toBe('model = "x"\n');
    expect(digest(userApp)).toBe(before);
    expect(await platform.findCodex()).toBeNull();
  });

  test('O-02 装不了时不覆盖、不下载：站主没装 ChatGPT 报「没找到 Codex」；沙盒里已有别的同名 App 不覆盖；复制失败如实报', async () => {
    fs.rmSync(userApp, { recursive: true });
    expect(await install()).toEqual({ r: { ok: false, reason: '没找到 Codex' }, events: ['copy:fail:没找到 Codex'] });
    makeFakeApp(userApp);
    fs.mkdirSync(path.join(copyApp(), 'Contents'), { recursive: true });
    fs.writeFileSync(path.join(copyApp(), 'Contents', 'Info.plist'), INFO_PLIST); // someone else's bundle id
    expect((await install()).r).toEqual({ ok: false, reason: '沙盒里已有同名的 App，没有覆盖它' });
    expect(fs.readFileSync(path.join(copyApp(), 'Contents', 'Info.plist'), 'utf8')).toBe(INFO_PLIST);
    fs.rmSync(copyApp(), { recursive: true });
    const failing = realSandboxMac(sandboxPaths(sandbox, 'mac'), { run: async () => { throw new Error('cp failed'); }, exec, sourceApp: userApp });
    expect(await failing.platform.installCodex(() => undefined)).toEqual({ ok: false, reason: '没能复制 Codex' });
    expect(fs.existsSync(copyApp())).toBe(false); // no half copy left behind
    // Copied, but the copy does not read as Codex
    const broken = realSandboxMac(sandboxPaths(sandbox, 'mac'), { run: async (cmd, args) => (cmd === 'plutil' && args[1] === 'CFBundleIdentifier' ? '' : run(cmd, args)), exec, sourceApp: userApp });
    expect(await broken.platform.installCodex(() => undefined)).toEqual({ ok: false, reason: '复制的 Codex 打不开' });
  });

  test('C-01 分身从沙盒副本复制、放在沙盒的 Applications、CODEX_HOME 是沙盒的 .codex-<名字>；沙盒副本自己不算分身', async () => {
    await install();
    const { clone, paths } = build();
    const info = await clone.make({ slug: 'deepseek', displayName: 'DeepSeek', iconPng: '', zh: false });
    expect(info).toEqual({ slug: 'deepseek', appPath: path.join(sandbox, 'Applications', 'DeepSeek.app'), codexHome: path.join(paths.home, '.codex-deepseek') });
    expect(calls).toContainEqual(['cp', '-cR', copyApp(), info.appPath]);
    expect(await clone.list()).toEqual([info]);
    // The clone runs the real binary, not the sandbox copy's launcher (which would set the sandbox's main CODEX_HOME)
    const probe = path.join(root, 'clone-probe');
    execFileSync(path.join(info.appPath, 'Contents', 'MacOS', CLONE_LAUNCHER), [], { env: { PATH: process.env.PATH, PROBE: probe } });
    expect(fs.readFileSync(`${probe}.env`, 'utf8')).toContain(`CODEX_HOME=${info.codexHome}\n`);
    // L-07: the 汉化 switch re-points clones only; the sandbox copy's launcher stays as it was
    const mainLauncher = fs.readFileSync(path.join(copyApp(), 'Contents', 'MacOS', CLONE_LAUNCHER), 'utf8');
    await clone.setZh(true);
    expect(fs.readFileSync(path.join(info.appPath, 'Contents', 'MacOS', CLONE_LAUNCHER), 'utf8')).toContain('CODEXBUDDY_ZH=1');
    expect(fs.readFileSync(path.join(copyApp(), 'Contents', 'MacOS', CLONE_LAUNCHER), 'utf8')).toBe(mainLauncher);
    await clone.open('deepseek');
    expect(calls).toContainEqual(['open', info.appPath]);
  });

  test('L-07 汉化版在沙盒的 Applications，打开的是沙盒副本，检测「开着」也只认沙盒副本', async () => {
    await install();
    const { zh, platform, paths } = build();
    expect(await zh.supported()).toBe(true);
    await zh.add();
    expect(paths.zhLauncherPath.startsWith(path.join(sandbox, 'Applications'))).toBe(true);
    const config = JSON.parse(fs.readFileSync(path.join(paths.zhLauncherPath, 'Contents', 'Resources', 'zh.json'), 'utf8'));
    expect(config).toMatchObject({ cmd: '/usr/bin/open', args: ['-a', copyApp(), '--args'], runningPattern: macRunningPattern(copyApp()) });
    await platform.openCodex({ zh: true });
    expect(execs).toContainEqual(['/usr/bin/open', paths.zhLauncherPath]);
  });

  test('拿真机路径构造会直接报错：沙盒副本不可能是站主自己的 ChatGPT.app', () => {
    expect(() => realSandboxMac(macPaths(root), { run, exec })).toThrow('user');
  });
});
