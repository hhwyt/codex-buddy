// 分身 on Windows. Owner: A9. Plan in docs/spikes.md (d): no copy of the Store package; a launcher (.lnk with its own
// System.AppUserModel.ID = CodexBuddy.<Slug>, name and .ico) that starts Codex with CODEX_HOME=%USERPROFILE%\.codex-<slug>
// and --user-data-dir=%APPDATA%\Codex (<Name>).
// Codex is started through the package's app execution alias (%LOCALAPPDATA%\Microsoft\WindowsApps\chatgpt-desktop.exe):
// it runs app\ChatGPT.exe with package identity, keeps the caller's environment (CODEX_HOME) and passes the arguments.
// app\Codex.exe is only a stub, and activation by AppUserModelID drops the environment. Spike d on hwy-pc (2026-11-13):
// a second instance with its own --user-data-dir runs next to the open Codex and uses the clone's CODEX_HOME.
// 汉化 (L-07): the launcher runs the same zh-runner.js as the Mac launchers (CodexBuddy's own Electron in node mode),
// which opens Codex with a 127.0.0.1 debug port and turns enable_i18n on; without CodexBuddy it opens Codex plainly.
// Layout: <appsDir>\<slug>\{launch.vbs, zh-runner.js, zh.json, icon.ico, clone.json}; shortcuts <Name>.lnk on the desktop
// and in the Start menu. remove(): guardedRemove the shortcuts and the launcher folder only; ~/.codex-<slug> and the data
// dir stay (C-07).
import * as path from 'node:path';
import { guardedRemove } from '../core/guard';
import { runCommand, type CommandRunner } from './clone-mac';
import type { Clone, CloneInfo, Platform } from './types';
import { writeZhRunner } from './zh-mac';

export interface ShortcutSpec {
  target: string;
  args: string;
  icon: string;
  appUserModelId: string;
  description: string;
}
export type ShortcutWriter = (lnk: string, spec: ShortcutSpec) => void;

/** Electron's shell.writeShortcutLink (the only Windows API that sets System.AppUserModel.ID without native code) */
const electronShortcut: ShortcutWriter = (lnk, spec) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { shell } = require('electron') as typeof import('electron');
  const ok = shell.writeShortcutLink(lnk, 'create', { // 'create' overwrites; 'replace' fails when the .lnk does not exist yet
    target: spec.target, args: spec.args, icon: spec.icon, iconIndex: 0, appUserModelId: spec.appUserModelId, description: spec.description,
  });
  if (!ok) throw new Error('没能建好快捷方式');
};

export interface WinCloneDeps {
  run?: CommandRunner;
  writeShortcut?: ShortcutWriter;
  /** The installed Codex (the Store package); defaults to platform.findCodex() */
  codex?: () => Promise<{ location: string; version: string } | null>;
  /** %APPDATA%, parent of the per-clone Electron data dir */
  appData?: string;
  /** Codex's app execution alias; defaults to %LOCALAPPDATA%\Microsoft\WindowsApps\chatgpt-desktop.exe */
  alias?: string;
  /** The program that runs zh-runner.js in node mode: CodexBuddy's own Electron (process.execPath) */
  nodeRunner?: string;
}

export interface WinCloneMeta {
  slug: string;
  name: string;
  /** Codex's app execution alias (what the launcher starts) */
  exe: string;
  /** Codex's own program, for the shortcut icon when the vendor logo is not a PNG */
  icon: string;
  codexHome: string;
  userData: string;
  zh: boolean;
  /** CodexBuddy's Electron, which runs zh-runner.js */
  nodeRunner: string;
}

const vbsString = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** launch.vbs. 汉化 on: run zh-runner.js with CodexBuddy's Electron (hidden), or open Codex plainly when it is gone */
export function launcherVbs(meta: WinCloneMeta, dir: string): string {
  const plain = `"${meta.exe}" --user-data-dir="${meta.userData}"`;
  const runner = `"${meta.nodeRunner}" "${path.join(dir, 'zh-runner.js')}" "${path.join(dir, 'zh.json')}"`;
  return [
    `' codexbuddy-clone ${meta.slug}`,
    'Set sh = CreateObject("WScript.Shell")',
    'Set env = sh.Environment("Process")',
    `env("CODEX_HOME") = ${vbsString(meta.codexHome)}`,
    `env("CODEX_ELECTRON_USER_DATA_PATH") = ${vbsString(meta.userData)}`,
    ...(meta.zh ? [
      `If CreateObject("Scripting.FileSystemObject").FileExists(${vbsString(meta.nodeRunner)}) Then`,
      '  env("ELECTRON_RUN_AS_NODE") = "1"',
      `  sh.Run ${vbsString(runner)}, 0, False`,
      '  WScript.Quit',
      'End If',
    ] : []),
    `sh.Run ${vbsString(plain)}, 1, False`,
    '',
  ].join('\r\n');
}

/** wscript reads a script as UTF-16 when it starts with the BOM; the ANSI code page cannot hold 智谱 or 混元 */
export const utf16le = (text: string) => new Uint8Array(Buffer.from('\ufeff' + text, 'utf16le'));

/** A .ico holding one PNG image (Vista+ reads PNG-compressed icons); null when the file is not a PNG */
export function pngToIco(png: Uint8Array): Uint8Array | null {
  const signature = [0x89, 0x50, 0x4e, 0x47];
  if (png.length < 24 || signature.some((b, i) => png[i] !== b)) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const side = (n: number) => (n >= 256 ? 0 : n);
  const ico = new Uint8Array(22 + png.length);
  const out = new DataView(ico.buffer);
  out.setUint16(2, 1, true); // type: icon
  out.setUint16(4, 1, true); // one image
  ico[6] = side(view.getUint32(16));
  ico[7] = side(view.getUint32(20));
  out.setUint16(10, 1, true); // planes
  out.setUint16(12, 32, true); // bits per pixel
  out.setUint32(14, png.length, true);
  out.setUint32(18, 22, true);
  ico.set(png, 22);
  return ico;
}

export const appUserModelIdOf = (slug: string) => `CodexBuddy.${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;

export function createWinClone(platform: Platform, deps: WinCloneDeps = {}): Clone {
  const { fs, paths } = platform;
  const run = deps.run ?? runCommand;
  const writeShortcut = deps.writeShortcut ?? electronShortcut;
  const codex = deps.codex ?? (async () => platform.findCodex());
  const appData = deps.appData ?? (process.env.APPDATA || path.join(paths.home, 'AppData', 'Roaming'));
  const alias = deps.alias ?? path.join(process.env.LOCALAPPDATA || path.join(paths.home, 'AppData', 'Local'), 'Microsoft', 'WindowsApps', 'chatgpt-desktop.exe');
  const nodeRunner = deps.nodeRunner ?? process.execPath;
  const roots = () => paths.protectedRoots();
  const dirOf = (slug: string) => path.join(paths.appsDir, slug);
  const lnksOf = (name: string) => [path.join(paths.desktopDir, `${name}.lnk`), path.join(paths.startMenuDir, `${name}.lnk`)];

  const scan = (): Array<CloneInfo & { meta: WinCloneMeta }> =>
    fs.list(paths.appsDir)
      .map(slug => {
        try {
          const meta = JSON.parse(fs.readText(path.join(dirOf(slug), 'clone.json')) ?? '') as WinCloneMeta;
          return meta.slug === slug ? { slug, appPath: dirOf(slug), codexHome: meta.codexHome, meta } : null;
        } catch {
          return null;
        }
      })
      .filter((c): c is CloneInfo & { meta: WinCloneMeta } => !!c);

  function write(meta: WinCloneMeta, version: string): void {
    const dir = dirOf(meta.slug);
    const vbs = path.join(dir, 'launch.vbs');
    writeZhRunner(fs, dir, {
      cmd: meta.exe, args: [`--user-data-dir=${meta.userData}`],
      env: { CODEX_HOME: meta.codexHome, CODEX_ELECTRON_USER_DATA_PATH: meta.userData },
      version, stateDir: dir, runningPattern: meta.userData,
    });
    fs.writeBytes(vbs, utf16le(launcherVbs(meta, dir)));
    const icon = path.join(dir, 'icon.ico');
    for (const lnk of lnksOf(meta.name)) {
      fs.mkdirp(path.dirname(lnk));
      writeShortcut(lnk, {
        target: 'wscript.exe', args: `"${vbs}"`, icon: fs.exists(icon) ? icon : meta.icon,
        appUserModelId: appUserModelIdOf(meta.slug), description: meta.name,
      });
    }
    // Written last: list() only shows a clone whose shortcuts were made
    fs.writeText(path.join(dir, 'clone.json'), JSON.stringify(meta, null, 2));
  }

  return {
    list: async () => scan().map(({ slug, appPath, codexHome }) => ({ slug, appPath, codexHome })),

    async make(spec) {
      const installed = await codex();
      if (!installed) throw new Error('没找到 Codex');
      const codexHome = paths.cloneHome(spec.slug);
      const userData = path.join(appData, `Codex (${spec.displayName})`);
      // C-08: keep ~/.codex-<slug> and the data dir as they are
      fs.mkdirp(codexHome);
      fs.mkdirp(userData);
      const old = scan().find(c => c.slug === spec.slug);
      if (old && old.meta.name !== spec.displayName) for (const lnk of lnksOf(old.meta.name)) guardedRemove(fs, lnk, roots());
      const dir = dirOf(spec.slug);
      fs.mkdirp(dir);
      const ico = pngToIco(fs.readBytes(spec.iconPng) ?? new Uint8Array());
      if (ico) fs.writeBytes(path.join(dir, 'icon.ico'), ico);
      write({
        slug: spec.slug, name: spec.displayName, exe: alias, icon: path.join(installed.location, 'app', 'ChatGPT.exe'),
        codexHome, userData, zh: spec.zh, nodeRunner,
      }, installed.version);
      return { slug: spec.slug, appPath: dir, codexHome };
    },

    async open(slug) {
      const clone = scan().find(c => c.slug === slug);
      if (!clone) throw new Error('这个分身还没做');
      await run('wscript.exe', [path.join(clone.appPath, 'launch.vbs')]);
    },

    async remove(slug) {
      for (const clone of scan().filter(c => c.slug === slug)) {
        for (const lnk of lnksOf(clone.meta.name)) guardedRemove(fs, lnk, roots());
        guardedRemove(fs, clone.appPath, roots());
      }
    },

    async setZh(zh) {
      const changed = scan().filter(c => c.meta.zh !== zh);
      if (!changed.length) return;
      const version = (await codex().catch(() => null))?.version ?? 'unknown';
      // Older clones (made before the alias launch) are rewritten with the current launch command too
      for (const clone of changed) write({ ...clone.meta, exe: alias, icon: clone.meta.icon ?? clone.meta.exe, nodeRunner, zh }, version);
    },
  };
}
