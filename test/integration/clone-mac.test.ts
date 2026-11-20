// L2: 分身 on Mac (C-01..C-10) against a fake ChatGPT.app in a temp sandbox. Real cp -c / plutil / sips / iconutil /
// codesign run on the fake bundle; `open` and lsregister are recorded instead of run (nothing is launched or registered).
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { buildCatalog, setCatalogLine } from '../../electron/core/catalogs';
import { GuardError } from '../../electron/core/guard';
import { providerOf } from '../../electron/core/providers';
import { joinLines } from '../../electron/core/toml';
import {
  CLONE_LAUNCHER, createMacClone, launcherScript, parseLauncher, runCommand, type CommandRunner,
} from '../../electron/platform/clone-mac';
import { nodeFs } from '../../electron/platform/node-fs';
import { sandboxPaths } from '../../electron/platform/sandbox';
import type { Platform } from '../../electron/platform/types';

const onMac = process.platform === 'darwin';
const logo = path.join(__dirname, '..', '..', 'ui', 'assets', 'logos', 'deepseek.png');
const fakeCodex = path.join(__dirname, '..', 'fakes', 'fake-codex.mjs');

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ChatGPT</string>
<key>CFBundleIdentifier</key><string>com.openai.codex</string>
<key>CFBundleName</key><string>ChatGPT</string>
<key>CFBundleDisplayName</key><string>ChatGPT</string>
<key>CFBundleIconName</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>26.1</string>
<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLSchemes</key><array><string>codex</string></array></dict></array>
</dict></plist>
`;

// The fake main executable: records env and args, then behaves like Codex asking the CLI for a reply
const FAKE_EXE = `#!/bin/bash
env > "$CLONE_PROBE.env"
printf '%s\\n' "$@" > "$CLONE_PROBE.args"
exec "${process.execPath}" "${fakeCodex}" exec hi
`;

let root: string;
let sourceApp: string;
let platform: Platform;
let calls: string[][];

function makeFakeApp(app: string) {
  fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
  fs.mkdirSync(path.join(app, 'Contents', 'Resources'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), INFO_PLIST);
  fs.writeFileSync(path.join(app, 'Contents', 'MacOS', 'ChatGPT'), FAKE_EXE, { mode: 0o755 });
  fs.writeFileSync(path.join(app, 'Contents', 'Resources', 'app.asar'), 'fake asar');
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
const recording = (inner: CommandRunner = runCommand): CommandRunner => async (cmd, args) => {
  calls.push([cmd, ...args]);
  if (cmd === 'open' || cmd.endsWith('/lsregister')) return '';
  return inner(cmd, args);
};

function fakePlatform(): Platform {
  return {
    os: 'mac', paths: sandboxPaths(root, 'mac'), fs: nodeFs,
    findCodex: async () => ({ version: '26.1', location: sourceApp, cli: '', running: false }),
  } as unknown as Platform;
}

const spec = (over: Partial<{ slug: string; displayName: string; iconPng: string; zh: boolean }> = {}) =>
  ({ slug: 'deepseek', displayName: 'DeepSeek', iconPng: logo, zh: false, ...over });
const plist = (app: string, key: string) => {
  try {
    return execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', path.join(app, 'Contents', 'Info.plist')], { stdio: 'pipe' }).toString().trim();
  } catch {
    return null;
  }
};
const runLauncher = (app: string, probe: string) =>
  execFileSync(path.join(app, 'Contents', 'MacOS', CLONE_LAUNCHER), [], {
    env: { PATH: process.env.PATH, CLONE_PROBE: probe, FAKE_CODEX_LOG: probe + '.log', CODEX_HOME: path.join(root, 'home', '.codex') },
    stdio: 'pipe',
  }).toString();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-clone-mac-'));
  fs.mkdirSync(path.join(root, 'home', '.codex'), { recursive: true });
  fs.writeFileSync(path.join(root, 'home', '.codex', 'config.toml'), 'model = "gpt-5.5"\n');
  sourceApp = path.join(root, 'Applications', 'ChatGPT.app');
  makeFakeApp(sourceApp);
  platform = fakePlatform();
  calls = [];
});

describe.runIf(onMac)('分身 Mac（真工具，假 App）', () => {
  test('C-01 做成分身生成独立 App，原来的 ChatGPT.app 一个字节不变', async () => {
    const before = digest(sourceApp);
    const clone = createMacClone(platform, { run: recording() });
    const info = await clone.make(spec());
    expect(info).toEqual({ slug: 'deepseek', appPath: path.join(root, 'Applications', 'DeepSeek.app'), codexHome: path.join(root, 'home', '.codex-deepseek') });
    expect(fs.existsSync(path.join(info.appPath, 'Contents', 'MacOS', CLONE_LAUNCHER))).toBe(true);
    expect(plist(info.appPath, 'CFBundleExecutable')).toBe(CLONE_LAUNCHER);
    execFileSync('codesign', ['--verify', '--deep', '--strict', info.appPath]);
    expect(digest(sourceApp)).toBe(before);
    expect(calls.some(c => c[0] === 'cp' && c[1] === '-cR')).toBe(true);
    expect(await clone.list()).toEqual([info]);
  });

  test('C-05 分身的名字、bundle id 和图标是厂商自己的', async () => {
    const info = await createMacClone(platform, { run: recording() }).make(spec());
    expect(plist(info.appPath, 'CFBundleName')).toBe('DeepSeek');
    expect(plist(info.appPath, 'CFBundleDisplayName')).toBe('DeepSeek');
    expect(plist(info.appPath, 'CFBundleIdentifier')).toBe('local.codexbuddy.deepseek');
    expect(plist(info.appPath, 'CFBundleIconFile')).toBe('deepseek.icns');
    expect(plist(info.appPath, 'CFBundleIconName')).toBeNull();
    expect(plist(info.appPath, 'CFBundleURLTypes')).toBeNull();
    const icns = fs.readFileSync(path.join(info.appPath, 'Contents', 'Resources', 'deepseek.icns'));
    expect(icns.subarray(0, 4).toString()).toBe('icns');
    // the temporary iconset is cleaned up
    expect(fs.existsSync(path.join(platform.paths.buddyDir, 'icon-work', 'deepseek'))).toBe(false);
  });

  test('C-04 分身用自己的 CODEX_HOME 和数据目录，关自动更新、不碰钥匙串', async () => {
    const info = await createMacClone(platform, { run: recording() }).make(spec());
    const probe = path.join(root, 'probe');
    runLauncher(info.appPath, probe);
    const env = fs.readFileSync(probe + '.env', 'utf8');
    const userData = path.join(root, 'home', 'Library', 'Application Support', 'Codex (DeepSeek)');
    expect(env).toContain(`CODEX_HOME=${info.codexHome}\n`);
    expect(env).toContain('CODEX_SPARKLE_ENABLED=false\n');
    expect(env).toContain(`CODEX_ELECTRON_USER_DATA_PATH=${userData}\n`);
    const args = fs.readFileSync(probe + '.args', 'utf8').split('\n');
    expect(args).toContain(`--user-data-dir=${userData}`);
    expect(args).toContain('--use-mock-keychain');
    expect(args.some(a => a.startsWith('--remote-debugging'))).toBe(false);
    expect(fs.existsSync(userData)).toBe(true);
    // the main Codex config is untouched
    expect(fs.readFileSync(path.join(root, 'home', '.codex', 'config.toml'), 'utf8')).toBe('model = "gpt-5.5"\n');
  });

  test('C-06 分身的模型菜单里只有它这一家的模型', async () => {
    const info = await createMacClone(platform, { run: recording() }).make(spec());
    // What CodexBuddy writes into the clone's own config (switch.ts with codexHome = the clone home)
    const deepseek = providerOf('deepseek');
    const catalog = path.join(info.codexHome, 'codexbuddy-models.json');
    fs.writeFileSync(catalog, JSON.stringify(buildCatalog(deepseek.models)));
    const lines = setCatalogLine(['model_provider = "deepseek"', 'model = "deepseek-flash"'], catalog);
    fs.writeFileSync(path.join(info.codexHome, 'config.toml'), joinLines(lines));
    fs.writeFileSync(path.join(info.codexHome, 'auth.json'), '{"OPENAI_API_KEY":"sk-fake-000000"}');
    const probe = path.join(root, 'probe');
    expect(runLauncher(info.appPath, probe)).toContain('好了');
    const log = JSON.parse(fs.readFileSync(probe + '.log', 'utf8').trim().split('\n').pop()!);
    expect(log.catalog).toEqual(['deepseek-flash', 'deepseek-v4-pro']);
    expect(log.key).toBe('****0000');
    // A model from another vendor is not in the clone's menu
    fs.writeFileSync(path.join(info.codexHome, 'config.toml'), joinLines(setCatalogLine(['model_provider = "deepseek"', 'model = "glm-5"'], catalog)));
    expect(() => runLauncher(info.appPath, probe)).toThrow(/Model not available: glm-5/);
  });

  test('C-02 打开分身：打开的是分身的 App', async () => {
    const clone = createMacClone(platform, { run: recording() });
    const info = await clone.make(spec());
    await clone.open('deepseek');
    expect(calls).toContainEqual(['open', info.appPath]);
    await expect(clone.open('kimi')).rejects.toThrow('这个分身还没做');
  });

  test('C-07 删除分身只删 App，~/.codex-deepseek 和数据目录留着', async () => {
    const clone = createMacClone(platform, { run: recording() });
    const info = await clone.make(spec());
    fs.mkdirSync(path.join(info.codexHome, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(info.codexHome, 'sessions', 'chat.jsonl'), '{"hello":1}');
    await clone.remove('deepseek');
    expect(fs.existsSync(info.appPath)).toBe(false);
    expect(fs.readFileSync(path.join(info.codexHome, 'sessions', 'chat.jsonl'), 'utf8')).toBe('{"hello":1}');
    expect(fs.existsSync(path.join(root, 'home', 'Library', 'Application Support', 'Codex (DeepSeek)'))).toBe(true);
    expect(fs.existsSync(sourceApp)).toBe(true);
    expect(await clone.list()).toEqual([]);
    await clone.remove('deepseek'); // nothing left: no error
  });

  test('C-08 再做同名分身时接上原来的聊天记录', async () => {
    const clone = createMacClone(platform, { run: recording() });
    const first = await clone.make(spec());
    fs.mkdirSync(path.join(first.codexHome, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(first.codexHome, 'sessions', 'old.jsonl'), 'old chat');
    fs.writeFileSync(path.join(first.codexHome, 'config.toml'), 'model = "deepseek-flash"\n');
    await clone.remove('deepseek');
    const again = await clone.make(spec());
    expect(again.codexHome).toBe(first.codexHome);
    expect(fs.readFileSync(path.join(again.codexHome, 'sessions', 'old.jsonl'), 'utf8')).toBe('old chat');
    expect(fs.readFileSync(path.join(again.codexHome, 'config.toml'), 'utf8')).toBe('model = "deepseek-flash"\n');
    // Making it again while it exists rebuilds the app and keeps the data too
    await clone.make(spec());
    expect(fs.readFileSync(path.join(again.codexHome, 'sessions', 'old.jsonl'), 'utf8')).toBe('old chat');
    expect((await clone.list()).length).toBe(1);
  });

  test('C-10 一键还原时分身 App 一起去掉，数据目录留着', async () => {
    const clone = createMacClone(platform, { run: recording() });
    const a = await clone.make(spec());
    const b = await clone.make(spec({ slug: 'kimi', displayName: 'Kimi' }));
    for (const c of await clone.list()) await clone.remove(c.slug);
    expect(fs.existsSync(a.appPath) || fs.existsSync(b.appPath)).toBe(false);
    expect(fs.existsSync(a.codexHome) && fs.existsSync(b.codexHome)).toBe(true);
    expect(fs.existsSync(path.join(root, 'home', '.codex', 'config.toml'))).toBe(true);
    expect(fs.existsSync(sourceApp)).toBe(true);
  });

  test('L-07 分身跟着汉化开关走：打开汉化后分身用调试端口启动，关掉后恢复，签名始终有效', async () => {
    const clone = createMacClone(platform, { run: recording() });
    const info = await clone.make(spec({ zh: true }));
    const probe = path.join(root, 'probe');
    runLauncher(info.appPath, probe);
    expect(fs.readFileSync(probe + '.args', 'utf8')).toContain('--remote-debugging-address=127.0.0.1');
    await clone.setZh(false);
    execFileSync('codesign', ['--verify', '--deep', '--strict', info.appPath]);
    runLauncher(info.appPath, probe);
    expect(fs.readFileSync(probe + '.args', 'utf8')).not.toContain('--remote-debugging');
    expect(fs.readFileSync(probe + '.env', 'utf8')).toContain('CODEXBUDDY_ZH=0\n');
    calls = [];
    await clone.setZh(false); // already English: nothing re-signed
    expect(calls.filter(c => c[0] === 'codesign')).toEqual([]);
    await clone.setZh(true);
    execFileSync('codesign', ['--verify', '--deep', '--strict', info.appPath]);
    runLauncher(info.appPath, probe);
    expect(fs.readFileSync(probe + '.env', 'utf8')).toContain('CODEXBUDDY_ZH=1\n');
  });

  test('C-01 已有一个不是分身的同名 App 时不动它，分身改名为「DeepSeek Codex」', async () => {
    const theirs = path.join(root, 'Applications', 'DeepSeek.app');
    fs.mkdirSync(theirs, { recursive: true });
    fs.writeFileSync(path.join(theirs, 'theirs.txt'), 'keep');
    const info = await createMacClone(platform, { run: recording() }).make(spec());
    expect(info.appPath).toBe(path.join(root, 'Applications', 'DeepSeek Codex.app'));
    expect(fs.readFileSync(path.join(theirs, 'theirs.txt'), 'utf8')).toBe('keep');
  });
});

describe('分身 Mac（假命令）', () => {
  const noop: CommandRunner = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'plutil' && args[0] === '-extract') return 'ChatGPT\n';
    if (cmd === 'cp') throw new Error('cp -c not supported');
    return '';
  };

  test('C-01 没装 Codex 时做不成分身', async () => {
    const clone = createMacClone(platform, { run: noop, sourceApp: async () => null });
    await expect(clone.make(spec())).rejects.toThrow('没找到 Codex');
    const viaFind = createMacClone({ ...platform, findCodex: async () => null }, { run: noop });
    await expect(viaFind.make(spec())).rejects.toThrow('没找到 Codex');
  });

  test('C-01 不支持 APFS 克隆时退回普通复制；图标做不出来时用原图标', async () => {
    const failingIcon: CommandRunner = async (cmd, args) => (cmd === 'sips' ? Promise.reject(new Error('no sips')) : noop(cmd, args));
    const info = await createMacClone(platform, { run: failingIcon }).make(spec());
    expect(fs.existsSync(path.join(info.appPath, 'Contents', 'Resources', 'app.asar'))).toBe(true);
    expect(calls.some(c => c.includes('CFBundleIconFile'))).toBe(false);
    const missingLogo = await createMacClone(platform, { run: noop }).make(spec({ slug: 'qwen', displayName: 'Qwen', iconPng: path.join(root, 'none.png') }));
    expect(fs.existsSync(missingLogo.appPath)).toBe(true);
  });

  test('C-01 签名失败时报错', async () => {
    const badSign: CommandRunner = async (cmd, args) => (cmd === 'codesign' ? Promise.reject(new Error('codesign failed')) : noop(cmd, args));
    await expect(createMacClone(platform, { run: badSign }).make(spec())).rejects.toThrow('codesign failed');
  });

  test('C-07 删除经过保护：分身记录指向 ~/.codex 之类的地方时拒绝删', async () => {
    const evil = path.join(root, 'Applications', 'Evil.app');
    // an .app whose launcher claims to be a clone but lives inside a protected folder is never reachable; the guard
    // still refuses protected targets if a clone path ever pointed there
    fs.mkdirSync(path.join(evil, 'Contents', 'MacOS'), { recursive: true });
    fs.writeFileSync(path.join(evil, 'Contents', 'MacOS', CLONE_LAUNCHER), launcherScript({ slug: 'evil', name: 'Evil', exe: 'x', codexHome: '', userData: '', zh: false }));
    const guarded = { ...platform, paths: { ...platform.paths, protectedRoots: () => ({ codexHome: evil, home: platform.paths.home, appDataDirs: [] }) } };
    await expect(createMacClone(guarded, { run: noop }).remove('evil')).rejects.toBeInstanceOf(GuardError);
    expect(fs.existsSync(evil)).toBe(true);
  });

  test('启动器记录读不出来时不当作分身', () => {
    expect(parseLauncher(null)).toBeNull();
    expect(parseLauncher('#!/bin/bash\necho hi')).toBeNull();
    expect(parseLauncher('# codexbuddy-clone {not json')).toBeNull();
    expect(parseLauncher('# codexbuddy-clone {"slug":1}')).toBeNull();
    const meta = { slug: 'kimi', name: "Kimi's", exe: 'ChatGPT', codexHome: "/h/it's", userData: '/u', zh: false };
    expect(parseLauncher(launcherScript(meta))).toEqual(meta);
    expect(launcherScript(meta)).toContain(`'/h/it'\\''s'`);
  });

  test('runCommand 返回输出，失败时带上错误信息', async () => {
    expect(await runCommand(process.execPath, ['-e', 'console.log("hi")'])).toBe('hi\n');
    await expect(runCommand(process.execPath, ['-e', 'process.exit(3)'])).rejects.toThrow(/failed/);
  });
});
