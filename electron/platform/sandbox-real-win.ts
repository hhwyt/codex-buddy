// Real-vendor test runs on Windows (CODEXBUDDY_SANDBOX + CODEXBUDDY_REAL_CODEX=1, no fake servers): every path stays
// in the sandbox, but Codex is the real Store package, run next to the user's own Codex the way a 分身 is: its own
// CODEX_HOME (<sandbox>\home\.codex) and its own --user-data-dir. The user's Codex, its %USERPROFILE%\.codex and the
// Store package are never touched: install only checks, uninstall does nothing, "running" means the sandbox's Codex.
// 汉化版 is a launcher like a clone's (zh-runner.js) at the sandbox's desktop and Start menu, never codex.ps1's, which
// would restart the user's own Codex.
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { createWinClone, type WinCloneDeps } from './clone-win';
import type { Clone, Platform, ZhLauncher } from './types';
import type { WinShell } from './win';

export const SANDBOX_CODEX_NAME = 'ChatGPT 汉化版';
const ZH_SLUG = 'zh';

export interface RealSandboxDeps {
  shell: Pick<WinShell, 'powershell'>;
  /** %APPDATA% inside the sandbox */
  appData: string;
  /** Codex's app execution alias (chatgpt-desktop.exe) */
  alias: string;
  /** Starts a program detached with extra environment */
  launch?: (exe: string, args: string[], env: Record<string, string>) => void;
  cloneDeps?: WinCloneDeps;
}

const spawnDetached = (exe: string, args: string[], env: Record<string, string>) => {
  spawn(exe, args, { detached: true, stdio: 'ignore', env: { ...process.env, ...env } }).on('error', () => { /* gone */ }).unref();
};

/** PowerShell: whether a ChatGPT.exe whose command line names this data dir runs */
export const runningPs = (userData: string) =>
  `@(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${userData.replace(/'/g, "''")}') }).Count`;

export function realSandboxWin(base: Platform, deps: RealSandboxDeps): { platform: Platform; clone: Clone; zh: ZhLauncher } {
  const { fs, paths } = base;
  const launch = deps.launch ?? spawnDetached;
  // The sandbox's own Codex: data dir shared by「打开 Codex」and the 汉化版 launcher, so both show the same chats
  const userData = path.join(deps.appData, `Codex (${SANDBOX_CODEX_NAME})`);
  const env = { CODEX_HOME: paths.codexHome, CODEX_ELECTRON_USER_DATA_PATH: userData };
  const isCodexRunning = async () => Number((await deps.shell.powershell(runningPs(userData))).out.trim()) > 0;

  const platform: Platform = {
    ...base,
    findCodex: async () => {
      const c = await base.findCodex();
      return c && { ...c, running: await isCodexRunning() };
    },
    // Codex is the user's own install: only report it, never install it
    installCodex: async progress => {
      if (await base.findCodex()) { progress({ id: 'check', state: 'done', text: 'Codex 已装好' }); return { ok: true }; }
      progress({ id: 'check', state: 'fail', text: '没找到 Codex' });
      return { ok: false, reason: '没找到 Codex' };
    },
    uninstallCodex: async () => ({ ok: true }),
    isCodexRunning,
    openCodex: async ({ zh: inChinese }) => {
      if (inChinese && fs.exists(paths.zhLauncherPath)) { await zhClone.open(ZH_SLUG); return; }
      fs.mkdirp(paths.codexHome);
      launch(deps.alias, [`--user-data-dir=${userData}`], env);
    },
  };

  // The 汉化版 launcher = a clone launcher named「ChatGPT 汉化版」whose CODEX_HOME is the sandbox's .codex, kept in
  // CodexBuddy's own folder so it never shows up as a 分身
  const zhClone = createWinClone(
    { ...platform, paths: { ...paths, appsDir: path.join(paths.buddyDir, 'zh-launcher'), cloneHome: () => paths.codexHome } },
    { appData: deps.appData, alias: deps.alias, ...deps.cloneDeps },
  );
  const zh: ZhLauncher = {
    exists: async () => fs.exists(paths.zhLauncherPath),
    supported: async () => !!(await base.findCodex()),
    add: async () => { await zhClone.make({ slug: ZH_SLUG, displayName: SANDBOX_CODEX_NAME, iconPng: '', zh: true }); },
    remove: async () => zhClone.remove(ZH_SLUG),
  };

  const clone = createWinClone(platform, { appData: deps.appData, alias: deps.alias, ...deps.cloneDeps });
  return { platform, clone, zh };
}
