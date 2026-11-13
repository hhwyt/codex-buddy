// Windows platform. Owner: A3.
// Codex on Windows = the Microsoft Store package OpenAI.Codex. Install and the 汉化版 shortcuts go through
// scripts/vendor/codex.ps1 (CODEX_SETUP_ACTION=install / edition); everything else is one PowerShell snippet
// (Get-AppxPackage, Remove-AppxPackage) or explorer.exe. All of it runs through an injectable WinShell, so tests
// assert the commands without Windows. Nothing here deletes files: uninstall removes the Store package only, and
// ~/.codex and %APPDATA%\Codex stay untouched.
import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';
import type { CodexRunner, FileSystem } from '../core/types';
import { nodeFs } from './node-fs';
import { codexRunner } from './run-codex';
import type { CodexInstall, InstallProgress, Paths, Platform } from './types';

export function winPaths(home = os.homedir()): Paths {
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const codexHome = process.env.CODEX_HOME || path.join(home, '.codex');
  const codexAppDataDirs = [path.join(appData, 'Codex')];
  const startMenuDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  return {
    home, codexHome,
    cloneHome: slug => path.join(home, `.codex-${slug}`),
    appsDir: path.join(localAppData, 'CodexBuddy', 'apps'),
    buddyDir: path.join(localAppData, 'CodexBuddy'),
    codexAppDataDirs,
    desktopDir: path.join(home, 'Desktop'),
    startMenuDir,
    zhLauncherPath: path.join(startMenuDir, 'ChatGPT 汉化版.lnk'),
    protectedRoots: () => ({ codexHome, home, appDataDirs: codexAppDataDirs }),
  };
}

/** What the platform needs from the OS. Tests pass a fake that records the commands */
export interface WinShell {
  /** Runs a PowerShell command hidden; resolves with the exit code and stdout. Each stdout line also goes to onLine */
  powershell(command: string, opts?: { env?: Record<string, string>; onLine?: (line: string) => void }): Promise<{ code: number; out: string }>;
  /** Starts a program detached, so it outlives CodexBuddy (explorer.exe) */
  launch(exe: string, args: string[]): void;
  /** Ends a process and its children (taskkill /F /T) */
  killTree(pid: number): Promise<void>;
}

export function createNodeWinShell(exes = { powershell: 'powershell.exe', taskkill: 'taskkill.exe' }): WinShell {
  return {
    powershell: (command, opts = {}) => new Promise(resolve => {
      const child = spawn(exes.powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); ${command}`], {
        windowsHide: true, env: { ...process.env, ...opts.env }, stdio: ['ignore', 'pipe', 'ignore'],
      });
      let out = '';
      readline.createInterface({ input: child.stdout! }).on('line', line => { out += `${line}\n`; opts.onLine?.(line); });
      child.on('error', () => resolve({ code: -1, out }));
      child.on('close', code => resolve({ code: code ?? -1, out }));
    }),
    launch: (exe, args) => { spawn(exe, args, { detached: true, stdio: 'ignore' }).on('error', () => { /* nothing to open */ }).unref(); },
    killTree: pid => new Promise<void>(resolve => {
      spawn(exes.taskkill, ['/F', '/T', '/PID', String(pid)], { windowsHide: true }).on('close', () => resolve()).on('error', () => resolve());
    }),
  };
}

/** Get-AppxPackage OpenAI.Codex plus the pids of the running Codex app (not its system sandbox service) */
export const FIND_CODEX_PS = `$p = Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
if ($p) {
  $appDir = Join-Path $p.InstallLocation 'app\\'
  $running = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($appDir, [StringComparison]::OrdinalIgnoreCase) -and $_.Name -notlike 'codex-windows-sandbox-service*' } | ForEach-Object { $_.ProcessId })
  @{ version = "$($p.Version)"; location = $p.InstallLocation; fullName = $p.PackageFullName; family = $p.PackageFamilyName; running = $running } | ConvertTo-Json -Compress
}`;
export const UNINSTALL_CODEX_PS = `try { Remove-AppxPackage -Package $env:CODEX_PACKAGE -ErrorAction Stop; 'OK' } catch { 'ERROR:' + $_.Exception.Message }`;

interface WinCodex { version: string; location: string; fullName: string; family: string; running: number[] }

/** Windows PowerShell 5.1 sometimes writes an array as {"value":[…],"Count":n}, and a single pid as a number */
function pids(raw: unknown): number[] {
  const list = Array.isArray(raw) ? raw : (raw as { value?: unknown })?.value ?? raw;
  return (Array.isArray(list) ? list : [list]).filter((x): x is number => typeof x === 'number');
}

export const GET_CODEX_REUSE_MS = 1500;

export const winCli = (location: string) => path.join(location, 'app', 'resources', 'codex.exe');

/** codex.ps1 progress line → event. The script's advice is written for its terminal ("rerun this command"); in the
 *  app that is the 再试一次 button */
export function parseStepLine(line: string): { id: string; state: 'start' | 'done' | 'fail'; text: string } | null {
  const m = /^STEP:([^:]+):(start|done|fail):(.*)$/.exec(line.trim());
  if (!m) return null;
  return { id: m[1], state: m[2] as 'start' | 'done' | 'fail', text: m[3].replace(/重新运行这行命令(再试一次)?/g, '点「再试一次」') };
}

export interface WinPlatform extends Platform {
  /** Runs codex.ps1 hidden with STEP lines on (zh-win.ts uses CODEX_SETUP_ACTION=edition). Resolves with the exit code */
  runCodexPs1(env: Record<string, string>, onLine: (line: string) => void): Promise<number>;
}

export interface WinOptions {
  shell?: WinShell;
  fs?: FileSystem;
  /** The packed codex.ps1 (dist/platform → ../../scripts/vendor) */
  codexPs1Source?: string;
}

export function createWinPlatform(paths: Paths = winPaths(), opts: WinOptions = {}): WinPlatform {
  const shell = opts.shell ?? createNodeWinShell();
  const fs = opts.fs ?? nodeFs;
  const codexPs1Source = opts.codexPs1Source ?? path.join(__dirname, '..', '..', 'scripts', 'vendor', 'codex.ps1');

  // One PowerShell start costs ~0.5 s and a single page load asks several times (app:state: installed, running, 汉化
  // supported): answers within GET_CODEX_REUSE_MS share one call
  let lastCodex: { at: number; result: Promise<WinCodex | null> } | null = null;
  function getCodex(): Promise<WinCodex | null> {
    const now = Date.now();
    if (lastCodex && now - lastCodex.at < GET_CODEX_REUSE_MS) return lastCodex.result;
    lastCodex = { at: now, result: readCodex() };
    return lastCodex.result;
  }
  async function readCodex(): Promise<WinCodex | null> {
    const { out } = await shell.powershell(FIND_CODEX_PS);
    try {
      const raw = out.trim() ? JSON.parse(out.trim()) : null;
      return raw && raw.location ? { ...raw, running: pids(raw.running) } : null;
    } catch { return null; }
  }

  /** PowerShell needs the script as a real file; run through iex of its text, as `irm | iex` does: unlike -File this is
   *  not blocked when group policy forbids running .ps1 files */
  function runCodexPs1(env: Record<string, string>, onLine: (line: string) => void): Promise<number> {
    const bytes = fs.readBytes(codexPs1Source);
    if (!bytes) return Promise.resolve(-1);
    const target = path.join(paths.buddyDir, 'scripts', 'codex.ps1');
    fs.mkdirp(path.dirname(target));
    fs.writeBytes(target, bytes);
    const command = `iex ([IO.File]::ReadAllText('${target.replace(/'/g, "''")}', [Text.Encoding]::UTF8))`;
    return shell.powershell(command, {
      env: { CODEX_HOME: paths.codexHome, CODEX_SETUP_CACHE_DIR: paths.buddyDir, CODEX_SETUP_STEPS: '1', CODEX_SETUP_NO_OPEN: '1', ...env },
      onLine,
    }).then(r => r.code);
  }

  async function installCodex(progress: InstallProgress) {
    let failText: string | null = null;
    lastCodex = null;
    const code = await runCodexPs1({ CODEX_SETUP_ACTION: 'install' }, line => {
      const step = parseStepLine(line);
      if (!step) return;
      if (step.state === 'fail') failText = step.text;
      progress(step);
    });
    lastCodex = null;
    return code === 0 ? { ok: true } : { ok: false, reason: failText ?? '没能装好 Codex' };
  }

  async function uninstallCodex() {
    const codex = await getCodex();
    if (!codex) return { ok: true };
    const { out } = await shell.powershell(UNINSTALL_CODEX_PS, { env: { CODEX_PACKAGE: codex.fullName } });
    lastCodex = null;
    return out.trim() === 'OK' ? { ok: true } : { ok: false, reason: '没能自动卸载：打开「设置 → 应用」，找到「ChatGPT」点卸载' };
  }

  const runCodex: CodexRunner = async (args, runOpts) => {
    const codex = await getCodex();
    if (!codex) return { out: '', err: '还没装 Codex', timedOut: false };
    return codexRunner(winCli(codex.location), pid => { void shell.killTree(pid); })(args, runOpts);
  };

  return {
    os: 'win', paths, fs, runCodexPs1, installCodex, uninstallCodex, runCodex,
    findCodex: async (): Promise<CodexInstall | null> => {
      const codex = await getCodex();
      return codex && { version: codex.version, location: codex.location, cli: winCli(codex.location), running: codex.running.length > 0 };
    },
    openCodex: async ({ zh }) => {
      // The 汉化版 shortcut: exactly what a double-click does (its headless launcher must outlive CodexBuddy)
      if (zh && fs.exists(paths.zhLauncherPath)) { shell.launch('explorer.exe', [paths.zhLauncherPath]); return; }
      const codex = await getCodex();
      if (!codex) throw new Error('还没装 Codex');
      shell.launch('explorer.exe', [`shell:AppsFolder\\${codex.family}!App`]);
    },
    isCodexRunning: async () => ((await getCodex())?.running.length ?? 0) > 0,
    revealInFolder: async target => { shell.launch('explorer.exe', [`/select,${target}`]); },
  };
}
