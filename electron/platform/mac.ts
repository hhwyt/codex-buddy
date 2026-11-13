// Mac platform. Owner: A2.
// Codex on Mac = /Applications/ChatGPT.app (bundle id com.openai.codex); CLI at
// Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex (spike (a)). Install = download the official dmg and
// copy the app into /Applications (never in tests: sandbox.ts paths). Never modify ChatGPT.app.
import * as os from 'node:os';
import * as path from 'node:path';
import { todo } from '../core/todo';
import { nodeFs } from './node-fs';
import { codexRunner } from './run-codex';
import type { Paths, Platform } from './types';

export function macPaths(home = os.homedir()): Paths {
  const appSupport = path.join(home, 'Library', 'Application Support');
  const codexHome = process.env.CODEX_HOME || path.join(home, '.codex');
  const codexAppDataDirs = [path.join(appSupport, 'Codex')];
  return {
    home, codexHome,
    cloneHome: slug => path.join(home, `.codex-${slug}`),
    appsDir: '/Applications',
    buddyDir: path.join(appSupport, 'CodexBuddy'),
    codexAppDataDirs,
    desktopDir: path.join(home, 'Desktop'),
    startMenuDir: '',
    zhLauncherPath: '/Applications/ChatGPT 汉化版.app',
    protectedRoots: () => ({ codexHome, home, appDataDirs: codexAppDataDirs }),
  };
}

export const MAC_CODEX_APP = '/Applications/ChatGPT.app';
export const macCli = (app: string) => path.join(app, 'Contents', 'Resources', 'codex-cli', 'CodexCLI.app', 'Contents', 'MacOS', 'codex');

export function createMacPlatform(paths: Paths = macPaths()): Platform {
  return {
    os: 'mac', paths, fs: nodeFs,
    findCodex: async () => todo('A2', 'mac findCodex'),
    installCodex: async () => todo('A2', 'mac installCodex'),
    uninstallCodex: async () => todo('A2', 'mac uninstallCodex'),
    runCodex: (args, opts) => codexRunner(macCli(MAC_CODEX_APP))(args, opts),
    openCodex: async () => todo('A2', 'mac openCodex'),
    isCodexRunning: async () => todo('A2', 'mac isCodexRunning'),
    revealInFolder: async () => todo('A2', 'mac revealInFolder'),
  };
}
