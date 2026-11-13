// Windows platform. Owner: A3.
// Codex on Windows = the Microsoft Store package OpenAI.Codex; install / edition via scripts/vendor/codex.ps1.
// Reference implementation of findCodex (Get-AppxPackage + running pids), runCodexPs1 and uninstall: main branch
// electron/buddy.ts and electron/main.ts (git show main:electron/buddy.ts).
import * as os from 'node:os';
import * as path from 'node:path';
import { todo } from '../core/todo';
import { nodeFs } from './node-fs';
import type { Paths, Platform } from './types';

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

export function createWinPlatform(paths: Paths = winPaths()): Platform {
  return {
    os: 'win', paths, fs: nodeFs,
    findCodex: async () => todo('A3', 'win findCodex'),
    installCodex: async () => todo('A3', 'win installCodex'),
    uninstallCodex: async () => todo('A3', 'win uninstallCodex'),
    runCodex: async () => todo('A3', 'win runCodex (codexRunner with taskkill /T)'),
    openCodex: async () => todo('A3', 'win openCodex'),
    isCodexRunning: async () => todo('A3', 'win isCodexRunning'),
    revealInFolder: async () => todo('A3', 'win revealInFolder'),
  };
}
