// Platform interfaces. FROZEN by Base. Implementations:
//   mac.ts (A2), win.ts (A3), sandbox.ts (Base; tests and CODEXBUDDY_SANDBOX runs), clone-mac.ts / clone-win.ts (A9),
//   zh-mac.ts / zh-win.ts (A6 for the UI flow; A2 / A3 own the OS details if A6 needs them).
// HARD RULES for every implementation:
//   - removals only through electron/core/guard.ts (guardedRemove), never fs.rm on a computed path directly;
//   - never modify the original Codex app (/Applications/ChatGPT.app or the Store package) by a single byte;
//   - in sandbox mode every path below lives inside CODEXBUDDY_SANDBOX.
import type { CodexRunner, FileSystem } from '../core/types';
import type { ProtectedRoots } from '../core/guard';

/** Every path CodexBuddy uses. sandbox.ts maps all of them into CODEXBUDDY_SANDBOX */
export interface Paths {
  home: string;
  /** ~/.codex (or CODEX_HOME) */
  codexHome: string;
  /** ~/.codex-<slug> for a clone */
  cloneHome(slug: string): string;
  /** /Applications on Mac; on Windows the folder that holds our launchers (%LOCALAPPDATA%\CodexBuddy\apps) */
  appsDir: string;
  /** CodexBuddy's own data: backups, secrets, original state, logs */
  buddyDir: string;
  /** Codex Electron data dirs (protected) */
  codexAppDataDirs: string[];
  /** Desktop and Start menu (Windows shortcuts); unused on Mac */
  desktopDir: string;
  startMenuDir: string;
  /** Where the 汉化版 launcher goes */
  zhLauncherPath: string;
  protectedRoots(): ProtectedRoots;
}

export interface CodexInstall {
  version: string;
  /** Mac: the .app path; Windows: the package install location */
  location: string;
  /** Path to the bundled CLI (Mac: …/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex; Win: …\app\resources\codex.exe) */
  cli: string;
  running: boolean;
}

export interface InstallProgress {
  (event: { id: string; state: 'start' | 'done' | 'fail'; text: string }): void;
}

export interface Platform {
  readonly os: 'mac' | 'win' | 'sandbox';
  readonly paths: Paths;
  readonly fs: FileSystem;
  /** The installed Codex, or null (O-02, M-16) */
  findCodex(): Promise<CodexInstall | null>;
  /** Installs Codex (Mac: download the dmg into /Applications — never in tests; Win: codex.ps1). O-01, O-03, O-07 */
  installCodex(progress: InstallProgress): Promise<{ ok: boolean; reason?: string }>;
  uninstallCodex(): Promise<{ ok: boolean; reason?: string }>;
  /** Runs the Codex CLI with CODEX_HOME set (connectivity test, `codex login`) */
  runCodex: CodexRunner;
  /** Opens Codex (the 汉化版 launcher when edition is zh) */
  openCodex(opts: { zh: boolean }): Promise<void>;
  /** Only called after the user confirms; excludes other installs, clones and CLI tasks. */
  restartCodex(opts: { zh: boolean }): Promise<void>;
  isCodexRunning(): Promise<boolean>;
  /** Shows a file in Finder / Explorer (S-02) */
  revealInFolder(target: string): Promise<void>;
}

/** 分身 (C-01..C-10). Mac: APFS clone + Info.plist + ad-hoc sign + launcher (skill codex-deepseek-fork).
 *  Windows: launcher with its own AppUserModelID, CODEX_HOME and user-data-dir (docs/spikes.md (d)) */
export interface CloneSpec {
  /** Vendor id, also the slug of ~/.codex-<slug> */
  slug: string;
  /** App name shown in Dock / taskbar, e.g. DeepSeek */
  displayName: string;
  /** PNG of the vendor logo (ui/assets/logos/<id>.png) */
  iconPng: string;
  /** Open in Chinese (follows the 汉化 switch, L-07) */
  zh: boolean;
}

export interface CloneInfo {
  slug: string;
  appPath: string;
  codexHome: string;
}

export interface Clone {
  list(): Promise<CloneInfo[]>;
  /** Creates or refreshes the clone app; keeps ~/.codex-<slug> if it exists (C-08) */
  make(spec: CloneSpec): Promise<CloneInfo>;
  open(slug: string): Promise<void>;
  /** Removes the app / launcher only; ~/.codex-<slug> and its Electron data dir stay (C-07, G-01) */
  remove(slug: string): Promise<void>;
  /** Re-points every clone's launcher at Chinese or English (L-07) */
  setZh(zh: boolean): Promise<void>;
}

/** 汉化版 launcher (L-01..L-07). Opens Codex with a 127.0.0.1 random debug port and turns enable_i18n on.
 *  The original ChatGPT.app stays byte for byte unchanged */
export interface ZhLauncher {
  /** Whether the「ChatGPT 汉化版」entry exists (the trash button shows only then, L-04) */
  exists(): Promise<boolean>;
  /** Adds the entry (Mac: /Applications/ChatGPT 汉化版.app; Win: desktop + Start menu shortcuts) */
  add(): Promise<void>;
  /** Removes the entry only, through guard.ts (L-04) */
  remove(): Promise<void>;
  /** Whether this Codex version can be switched to Chinese (L-06) */
  supported(): Promise<boolean>;
}
