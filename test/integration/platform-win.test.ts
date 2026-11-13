// L2: the Windows platform with a fake PowerShell runner (asserts the commands) and, for the real runner, small shell
// scripts standing in for powershell.exe / taskkill.exe / codex.exe. Everything lives in a temp sandbox: no real
// ~/.codex, no Store package, no Windows needed.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import { sandboxPaths } from '../../electron/platform/sandbox';
import {
  createNodeWinShell, createWinPlatform, FIND_CODEX_PS, parseStepLine, UNINSTALL_CODEX_PS, winCli, winPaths, type WinShell,
} from '../../electron/platform/win';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cb-win-'));

interface Call { command: string; env?: Record<string, string> }
/** Fake WinShell: answers each PowerShell command with the first matching reply, records every call */
function fakeShell(reply: (command: string, env?: Record<string, string>) => { code?: number; out?: string; lines?: string[] }) {
  const calls: Call[] = [], launched: [string, string[]][] = [], killed: number[] = [];
  const shell: WinShell = {
    powershell: async (command, opts = {}) => {
      calls.push({ command, env: opts.env });
      const r = reply(command, opts.env);
      for (const line of r.lines ?? []) opts.onLine?.(line);
      return { code: r.code ?? 0, out: r.out ?? '' };
    },
    launch: (exe, args) => { launched.push([exe, args]); },
    killTree: async pid => { killed.push(pid); try { process.kill(pid); } catch { /* gone */ } },
  };
  return { shell, calls, launched, killed };
}

const codexJson = (extra: Record<string, unknown> = {}) => JSON.stringify({
  version: '26.1.5.0', location: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1.5.0_x64__abc',
  fullName: 'OpenAI.Codex_26.1.5.0_x64__abc', family: 'OpenAI.Codex_abc', running: [], ...extra,
});

function setup(reply: Parameters<typeof fakeShell>[0]) {
  const root = tmp();
  const paths = sandboxPaths(root, 'win');
  const ps1 = path.join(root, 'codex.ps1');
  fs.writeFileSync(ps1, "Write-Host 'hi'");
  const fake = fakeShell(reply);
  const platform = createWinPlatform(paths, { shell: fake.shell, codexPs1Source: ps1 });
  return { root, paths, platform, ...fake };
}

describe('findCodex', () => {
  test('O-02 已经装了 Codex：读出商店版的版本、位置和自带的 codex.exe', async () => {
    const { platform, calls } = setup(() => ({ out: codexJson() + '\r\n' }));
    const codex = await platform.findCodex();
    expect(calls[0].command).toBe(FIND_CODEX_PS);
    expect(calls[0].command).toContain('Get-AppxPackage -Name OpenAI.Codex');
    expect(codex).toEqual({
      version: '26.1.5.0', location: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1.5.0_x64__abc',
      cli: winCli('C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1.5.0_x64__abc'), running: false,
    });
    expect(codex!.cli.endsWith(path.join('app', 'resources', 'codex.exe'))).toBe(true);
  });

  test('M-16 Codex 被删了：找不到时返回 null（空输出、坏 JSON、缺字段都算没有）', async () => {
    for (const out of ['', 'garbage{', 'null', '{"version":"1"}']) {
      const { platform } = setup(() => ({ out }));
      expect(await platform.findCodex()).toBeNull();
    }
  });

  test('M-21 Codex 开着：只看出它在运行，不关它（PowerShell 5.1 的各种数组写法都认）', async () => {
    for (const running of [[4242], 4242, { value: [4242, 4243], Count: 2 }]) {
      const { platform, killed, calls } = setup(() => ({ out: codexJson({ running }) }));
      expect(await platform.isCodexRunning()).toBe(true);
      expect((await platform.findCodex())!.running).toBe(true);
      expect(killed).toEqual([]);
      expect(calls.every(c => !/Stop-Process|taskkill/i.test(c.command))).toBe(true);
    }
    const { platform } = setup(() => ({ out: codexJson({ running: null }) }));
    expect(await platform.isCodexRunning()).toBe(false);
    const none = setup(() => ({ out: '' }));
    expect(await none.platform.isCodexRunning()).toBe(false);
  });
});

describe('installCodex', () => {
  test('O-01 安装：codex.ps1 只装 Codex，进度一行行传给界面', async () => {
    const lines = ['STEP:check:start:检测电脑', 'noise', 'STEP:check:done:Windows 11', 'STEP:install:start:下载 Codex', 'STEP:install:done:Codex 26.1.5.0 已装好'];
    const { platform, calls, paths } = setup(() => ({ code: 0, lines }));
    const events: unknown[] = [];
    expect(await platform.installCodex(e => events.push(e))).toEqual({ ok: true });
    expect(events).toEqual([
      { id: 'check', state: 'start', text: '检测电脑' }, { id: 'check', state: 'done', text: 'Windows 11' },
      { id: 'install', state: 'start', text: '下载 Codex' }, { id: 'install', state: 'done', text: 'Codex 26.1.5.0 已装好' },
    ]);
    const target = path.join(paths.buddyDir, 'scripts', 'codex.ps1');
    expect(fs.readFileSync(target, 'utf8')).toBe("Write-Host 'hi'");
    expect(calls[0].command).toBe(`iex ([IO.File]::ReadAllText('${target}', [Text.Encoding]::UTF8))`);
    expect(calls[0].env).toEqual({
      CODEX_HOME: paths.codexHome, CODEX_SETUP_CACHE_DIR: paths.buddyDir, CODEX_SETUP_STEPS: '1', CODEX_SETUP_NO_OPEN: '1', CODEX_SETUP_ACTION: 'install',
    });
  });

  test('L-01 安装时不问汉化：不传 CODEX_SETUP_EDITION', async () => {
    const { platform, calls } = setup(() => ({ code: 0 }));
    await platform.installCodex(() => {});
    expect(calls[0].env).not.toHaveProperty('CODEX_SETUP_EDITION');
  });

  test('O-03 安装失败：带回失败那一步的原因，「重新运行这行命令」换成「点「再试一次」」', async () => {
    const { platform } = setup(() => ({ code: 1, lines: ['STEP:check:start:检测电脑', 'STEP:install:fail:没能自动安装 Codex，装好后重新运行这行命令。'] }));
    const events: { state: string; text: string }[] = [];
    const r = await platform.installCodex(e => events.push(e));
    expect(r).toEqual({ ok: false, reason: '没能自动安装 Codex，装好后点「再试一次」。' });
    expect(events.at(-1)).toMatchObject({ state: 'fail' });
    const silent = setup(() => ({ code: 1 }));
    expect(await silent.platform.installCodex(() => {})).toEqual({ ok: false, reason: '没能装好 Codex' });
  });

  test('O-07 再试一次：用同一个缓存目录，已下载的接着用', async () => {
    const { platform, calls, paths } = setup(() => ({ code: 0 }));
    await platform.installCodex(() => {});
    await platform.installCodex(() => {});
    expect(calls.map(c => c.env!.CODEX_SETUP_CACHE_DIR)).toEqual([paths.buddyDir, paths.buddyDir]);
  });

  test('O-03 打包里缺 codex.ps1：不启动 PowerShell，直接报装不上', async () => {
    const root = tmp();
    const fake = fakeShell(() => ({}));
    const platform = createWinPlatform(sandboxPaths(root, 'win'), { shell: fake.shell, codexPs1Source: path.join(root, 'missing.ps1') });
    expect(await platform.installCodex(() => {})).toEqual({ ok: false, reason: '没能装好 Codex' });
    expect(await platform.runCodexPs1({ CODEX_SETUP_ACTION: 'edition' }, () => {})).toBe(-1);
    expect(fake.calls).toEqual([]);
  });

  test('O-03 路径里有单引号也能运行（PowerShell 字符串转义）', async () => {
    const root = path.join(tmp(), "o'brien");
    const fake = fakeShell(() => ({ code: 0 }));
    const ps1 = path.join(tmp(), 'codex.ps1');
    fs.writeFileSync(ps1, 'x');
    const platform = createWinPlatform(sandboxPaths(root, 'win'), { shell: fake.shell, codexPs1Source: ps1 });
    await platform.runCodexPs1({}, () => {});
    expect(fake.calls[0].command).toContain("o''brien");
  });
});

test('parseStepLine：只认 STEP:<id>:<start|done|fail>:<text>', () => {
  expect(parseStepLine('STEP:all:done:a:b')).toEqual({ id: 'all', state: 'done', text: 'a:b' });
  expect(parseStepLine('STEP:x:maybe:y')).toBeNull();
  expect(parseStepLine('hello')).toBeNull();
});

describe('uninstallCodex', () => {
  test('G-01 卸载只删商店包，~/.codex 和 Codex 数据目录一字节不动', async () => {
    const { platform, calls, paths } = setup(c => (c === FIND_CODEX_PS ? { out: codexJson() } : { out: 'OK\r\n' }));
    fs.mkdirSync(paths.codexHome, { recursive: true });
    fs.writeFileSync(path.join(paths.codexHome, 'config.toml'), 'model = "x"\n');
    fs.mkdirSync(paths.codexAppDataDirs[0], { recursive: true });
    fs.writeFileSync(path.join(paths.codexAppDataDirs[0], 'state'), 's');
    expect(await platform.uninstallCodex()).toEqual({ ok: true });
    expect(calls[1]).toEqual({ command: UNINSTALL_CODEX_PS, env: { CODEX_PACKAGE: 'OpenAI.Codex_26.1.5.0_x64__abc' } });
    expect(UNINSTALL_CODEX_PS).toContain('Remove-AppxPackage');
    expect(fs.readFileSync(path.join(paths.codexHome, 'config.toml'), 'utf8')).toBe('model = "x"\n');
    expect(fs.readFileSync(path.join(paths.codexAppDataDirs[0], 'state'), 'utf8')).toBe('s');
  });

  test('G-01 没装 Codex 就什么都不做；卸载失败告诉用户去「设置 → 应用」', async () => {
    const none = setup(() => ({ out: '' }));
    expect(await none.platform.uninstallCodex()).toEqual({ ok: true });
    expect(none.calls).toHaveLength(1);
    const failing = setup(c => (c === FIND_CODEX_PS ? { out: codexJson() } : { out: 'ERROR:access denied' }));
    expect(await failing.platform.uninstallCodex()).toMatchObject({ ok: false, reason: expect.stringContaining('设置 → 应用') });
  });
});

describe('openCodex / revealInFolder', () => {
  test('L-02 汉化版快捷方式在：从它打开（和双击一样）', async () => {
    const { platform, launched, paths, calls } = setup(() => ({ out: codexJson() }));
    fs.mkdirSync(path.dirname(paths.zhLauncherPath), { recursive: true });
    fs.writeFileSync(paths.zhLauncherPath, 'lnk');
    await platform.openCodex({ zh: true });
    expect(launched).toEqual([['explorer.exe', [paths.zhLauncherPath]]]);
    expect(calls).toEqual([]);
  });

  test('L-03 英文原版或没有汉化快捷方式：按商店应用打开', async () => {
    const { platform, launched } = setup(() => ({ out: codexJson() }));
    await platform.openCodex({ zh: true });
    await platform.openCodex({ zh: false });
    expect(launched).toEqual([['explorer.exe', ['shell:AppsFolder\\OpenAI.Codex_abc!App']], ['explorer.exe', ['shell:AppsFolder\\OpenAI.Codex_abc!App']]]);
  });

  test('M-16 没装 Codex 时打开会报「还没装 Codex」', async () => {
    const { platform } = setup(() => ({ out: '' }));
    await expect(platform.openCodex({ zh: false })).rejects.toThrow('还没装 Codex');
  });

  test('S-02 在文件夹里显示：资源管理器选中那个文件', async () => {
    const { platform, launched } = setup(() => ({}));
    await platform.revealInFolder('C:\\Users\\x\\.codex\\config.toml');
    expect(launched).toEqual([['explorer.exe', ['/select,C:\\Users\\x\\.codex\\config.toml']]]);
  });
});

describe('runCodex', () => {
  const cliDir = (location: string) => path.dirname(winCli(location));
  function withCli(script: string) {
    const location = tmp();
    fs.mkdirSync(cliDir(location), { recursive: true });
    const cli = winCli(location);
    fs.writeFileSync(cli, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
    return location;
  }

  test('M-07 用 Codex 自带的 codex.exe、带 CODEX_HOME 跑', async () => {
    const location = withCli('echo "home=$CODEX_HOME args=$*"');
    const { platform } = setup(() => ({ out: codexJson({ location }) }));
    const home = tmp();
    const r = await platform.runCodex(['exec', 'hi'], { codexHome: home, timeoutMs: 10_000 });
    expect(r.out.trim()).toBe(`home=${home} args=exec hi`);
    expect(r.timedOut).toBe(false);
  });

  test('M-07 超时就用 taskkill /T 结束整棵进程树', async () => {
    const location = withCli('sleep 5');
    const { platform, killed } = setup(() => ({ out: codexJson({ location }) }));
    const r = await platform.runCodex(['exec'], { codexHome: tmp(), timeoutMs: 200 });
    expect(r.timedOut).toBe(true);
    expect(killed).toHaveLength(1);
  });

  test('M-16 没装 Codex：不跑，直接说还没装', async () => {
    const { platform } = setup(() => ({ out: '' }));
    expect(await platform.runCodex(['exec'], { codexHome: tmp(), timeoutMs: 1000 })).toEqual({ out: '', err: '还没装 Codex', timedOut: false });
  });
});

describe('real shell (stand-in executables)', () => {
  function exe(dir: string, name: string, body: string) {
    const f = path.join(dir, name);
    fs.writeFileSync(f, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    return f;
  }

  test('O-01 PowerShell 隐藏运行：参数、环境变量、逐行输出和退出码', async () => {
    const dir = tmp();
    const ps = exe(dir, 'powershell', 'printf "%s|%s|%s|%s\\n" "$1" "$2" "$3" "$4"; echo "$5"; echo "env=$CB_X"; exit 3');
    const shell = createNodeWinShell({ powershell: ps, taskkill: 'nope' });
    const lines: string[] = [];
    const r = await shell.powershell('Get-Thing', { env: { CB_X: 'y' }, onLine: l => lines.push(l) });
    expect(r.code).toBe(3);
    expect(lines).toEqual(['-NoProfile|-ExecutionPolicy|Bypass|-Command', '[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); Get-Thing', 'env=y']);
    expect(r.out).toBe(lines.map(l => `${l}\n`).join(''));
    expect((await shell.powershell('x')).code).toBe(3);
  });

  test('O-03 没有 PowerShell：返回 -1，不崩', async () => {
    const shell = createNodeWinShell({ powershell: path.join(tmp(), 'missing'), taskkill: path.join(tmp(), 'missing') });
    expect(await shell.powershell('x')).toEqual({ code: -1, out: '' });
    await expect(shell.killTree(1)).resolves.toBeUndefined();
    expect(() => shell.launch(path.join(tmp(), 'missing'), [])).not.toThrow();
  });

  test('M-07 taskkill /F /T /PID 和分离启动', async () => {
    const dir = tmp();
    const log = path.join(dir, 'log');
    const tk = exe(dir, 'taskkill', `echo "$*" > "${log}"`);
    const shell = createNodeWinShell({ powershell: 'nope', taskkill: tk });
    await shell.killTree(123);
    expect(fs.readFileSync(log, 'utf8').trim()).toBe('/F /T /PID 123');
    const launched = path.join(dir, 'launched');
    shell.launch(exe(dir, 'explorer', `echo "$1" > "${launched}"`), ['/select,a b']);
    for (let i = 0; i < 50 && !fs.existsSync(launched); i++) await new Promise(r => setTimeout(r, 20));
    expect(fs.readFileSync(launched, 'utf8').trim()).toBe('/select,a b');
  });
});

describe('winPaths', () => {
  test('G-01 用户数据目录都在受保护名单里', () => {
    const saved = { APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA, CODEX_HOME: process.env.CODEX_HOME };
    delete process.env.APPDATA; delete process.env.LOCALAPPDATA; delete process.env.CODEX_HOME;
    try {
      const p = winPaths('/h');
      expect(p.codexHome).toBe(path.join('/h', '.codex'));
      expect(p.cloneHome('deepseek')).toBe(path.join('/h', '.codex-deepseek'));
      expect(p.buddyDir).toBe(path.join('/h', 'AppData', 'Local', 'CodexBuddy'));
      expect(p.appsDir).toBe(path.join(p.buddyDir, 'apps'));
      expect(p.zhLauncherPath).toBe(path.join('/h', 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'ChatGPT 汉化版.lnk'));
      expect(p.protectedRoots()).toEqual({ codexHome: p.codexHome, home: '/h', appDataDirs: [path.join('/h', 'AppData', 'Roaming', 'Codex')] });
      process.env.APPDATA = '/a'; process.env.LOCALAPPDATA = '/l'; process.env.CODEX_HOME = '/c';
      const q = winPaths('/h');
      expect([q.codexHome, q.buddyDir, q.codexAppDataDirs[0]]).toEqual(['/c', path.join('/l', 'CodexBuddy'), path.join('/a', 'Codex')]);
    } finally {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });

  test('默认参数：真实 shell 和 nodeFs，不立即调用任何东西', () => {
    const p = createWinPlatform(winPaths(tmp()));
    expect(p.os).toBe('win');
    expect(typeof p.fs.exists).toBe('function');
  });
});
