// 汉化版 launcher on Windows. Owner: A10 (was A6). Reuses codex.ps1's own launcher: CODEX_SETUP_ACTION=edition with
// CODEX_SETUP_EDITION=zh writes the launcher script and the desktop + Start menu「ChatGPT 汉化版.lnk」 shortcuts (it
// opens Codex with a 127.0.0.1 debug port and turns enable_i18n on). remove(): guardedRemove the shortcuts only (L-04).
import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { guardedRemove } from '../core/guard';
import type { Platform, ZhLauncher } from './types';

export type Ps1Runner = (env: Record<string, string>) => Promise<{ code: number; out: string }>;
export type Exec = (cmd: string, args: string[]) => Promise<{ code: number; out: string }>;

export interface WinZhDeps {
  runPs1: Ps1Runner;
  /** The installed Codex version, or null when Codex is not installed */
  codexVersion(): Promise<string | null>;
}

export const ZH_SHORTCUT = 'ChatGPT 汉化版.lnk';
/** The name older installers used; removed together with the current one */
export const OLD_ZH_SHORTCUT = 'Codex 汉化版.lnk';

/** codex.ps1 next to the packaged app (asar unpacked) */
export const bundledPs1 = (dir = __dirname) =>
  path.join(dir, '..', '..', 'scripts', 'vendor', 'codex.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');

/** Reads codex.ps1 as UTF-8 and runs it through iex, like win.ts runCodexPs1: with -File, Windows PowerShell 5.1 reads
 *  the BOM-less file in the ANSI code page, the Chinese text breaks the parse and 汉化 always fails */
export function realPs1Runner(ps1 = bundledPs1(), spawnFile = execFile): Ps1Runner {
  const command = `iex ([IO.File]::ReadAllText('${ps1.replace(/'/g, "''")}', [Text.Encoding]::UTF8))`;
  return env => new Promise(resolve => {
    spawnFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { env: { ...process.env, ...env }, windowsHide: true, timeout: 120_000 },
      (error, stdout) => resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, out: String(stdout) }));
  });
}

/** Whether Codex (ChatGPT.exe of the Store package) is running (L-05) */
export async function isWinCodexRunning(exec: Exec): Promise<boolean> {
  const { out } = await exec('tasklist.exe', ['/FI', 'IMAGENAME eq ChatGPT.exe', '/NH', '/FO', 'CSV']);
  return /"ChatGPT\.exe"/i.test(out);
}

export function createWinZh(platform: Platform, deps: Partial<WinZhDeps> = {}): ZhLauncher {
  const { fs, paths } = platform;
  const runPs1 = deps.runPs1 ?? realPs1Runner();
  const codexVersion = deps.codexVersion ?? (async () => (await platform.findCodex().catch(() => null))?.version ?? null);
  const folders = [paths.desktopDir, paths.startMenuDir];
  const shortcuts = folders.map(dir => path.join(dir, ZH_SHORTCUT));

  return {
    exists: async () => shortcuts.some(link => fs.exists(link)),

    supported: async () => {
      const version = await codexVersion();
      // codex.ps1's launcher writes disabled-<version>.txt next to itself when the patch broke Codex
      return !!version && !fs.exists(path.join(paths.buddyDir, `disabled-${version}.txt`));
    },

    add: async () => {
      if (!(await codexVersion())) throw new Error('没找到 Codex');
      const { code } = await runPs1({ CODEX_SETUP_ACTION: 'edition', CODEX_SETUP_EDITION: 'zh' });
      if (code !== 0 || !fs.exists(paths.zhLauncherPath)) throw new Error('汉化版没加上');
    },

    remove: async () => {
      for (const dir of folders) {
        for (const name of [ZH_SHORTCUT, OLD_ZH_SHORTCUT]) guardedRemove(fs, path.join(dir, name), paths.protectedRoots());
      }
    },
  };
}
