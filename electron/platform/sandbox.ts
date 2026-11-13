// Sandbox paths: every path CodexBuddy touches, mapped inside one folder (CODEXBUDDY_SANDBOX). Owner: Base.
// Used by tests and by e2e runs of the real app. Nothing outside the sandbox is read or written: no real ~/.codex,
// no /Applications, no real Codex app.
import * as path from 'node:path';
import type { Paths } from './types';

export const SANDBOX_ENV = 'CODEXBUDDY_SANDBOX';

export function sandboxPaths(root: string, os: 'mac' | 'win' = process.platform === 'win32' ? 'win' : 'mac'): Paths {
  const home = path.join(root, 'home');
  const appSupport = os === 'mac' ? path.join(home, 'Library', 'Application Support') : path.join(home, 'AppData', 'Roaming');
  const appsDir = os === 'mac' ? path.join(root, 'Applications') : path.join(home, 'AppData', 'Local', 'CodexBuddy', 'apps');
  const codexHome = path.join(home, '.codex');
  const codexAppDataDirs = [path.join(appSupport, 'Codex')];
  const desktopDir = path.join(home, 'Desktop');
  const startMenuDir = path.join(appSupport, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  return {
    home,
    codexHome,
    cloneHome: slug => path.join(home, `.codex-${slug}`),
    appsDir,
    buddyDir: os === 'mac' ? path.join(appSupport, 'CodexBuddy') : path.join(home, 'AppData', 'Local', 'CodexBuddy'),
    codexAppDataDirs,
    desktopDir,
    startMenuDir,
    zhLauncherPath: os === 'mac' ? path.join(appsDir, 'ChatGPT 汉化版.app') : path.join(startMenuDir, 'ChatGPT 汉化版.lnk'),
    protectedRoots: () => ({ codexHome, home, appDataDirs: codexAppDataDirs }),
  };
}

/** The sandbox root when CodexBuddy runs sandboxed, else null */
export const sandboxRoot = (env: NodeJS.ProcessEnv = process.env): string | null => env[SANDBOX_ENV] || null;
