// 分身 on Windows. Owner: A9. Plan in docs/spikes.md (d): no copy of the Store package; a launcher (.lnk with its own
// System.AppUserModel.ID = CodexBuddy.<Slug>, name and .ico) that starts Codex with CODEX_HOME=%USERPROFILE%\.codex-<slug>
// and --user-data-dir=%APPDATA%\Codex (<Name>). Fallback if two instances cannot run side by side: a portable copy.
// Layout: <appsDir>\<slug>\{launch.vbs, icon.ico, clone.json}; shortcuts <Name>.lnk on the desktop and in the Start menu.
// remove(): guardedRemove the shortcuts and the launcher folder only; ~/.codex-<slug> and the data dir stay (C-07).
import * as path from 'node:path';
import { guardedRemove } from '../core/guard';
import { runCommand, type CommandRunner } from './clone-mac';
import type { Clone, CloneInfo, Platform } from './types';

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
  const ok = shell.writeShortcutLink(lnk, 'replace', {
    target: spec.target, args: spec.args, icon: spec.icon, iconIndex: 0, appUserModelId: spec.appUserModelId, description: spec.description,
  });
  if (!ok) throw new Error('没能建好快捷方式');
};

export interface WinCloneDeps {
  run?: CommandRunner;
  writeShortcut?: ShortcutWriter;
  /** Codex's install location (the Store package); defaults to platform.findCodex() */
  codexLocation?: () => Promise<string | null>;
  /** %APPDATA%, parent of the per-clone Electron data dir */
  appData?: string;
}

export interface WinCloneMeta {
  slug: string;
  name: string;
  exe: string;
  codexHome: string;
  userData: string;
  zh: boolean;
}

const vbsString = (s: string) => `"${s.replace(/"/g, '""')}"`;

export function launcherVbs(meta: WinCloneMeta): string {
  const zhArgs = meta.zh ? ' --remote-debugging-address=127.0.0.1 --remote-debugging-port=0' : '';
  const command = `"${meta.exe}" --user-data-dir="${meta.userData}"${zhArgs}`;
  return [
    `' codexbuddy-clone ${meta.slug}`,
    'Set sh = CreateObject("WScript.Shell")',
    'Set env = sh.Environment("Process")',
    `env("CODEX_HOME") = ${vbsString(meta.codexHome)}`,
    `env("CODEX_ELECTRON_USER_DATA_PATH") = ${vbsString(meta.userData)}`,
    `env("CODEXBUDDY_ZH") = "${meta.zh ? 1 : 0}"`,
    `sh.Run ${vbsString(command)}, 1, False`,
    '',
  ].join('\r\n');
}

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
  const codexLocation = deps.codexLocation ?? (async () => (await platform.findCodex())?.location ?? null);
  const appData = deps.appData ?? (process.env.APPDATA || path.join(paths.home, 'AppData', 'Roaming'));
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

  function write(meta: WinCloneMeta): void {
    const dir = dirOf(meta.slug);
    const vbs = path.join(dir, 'launch.vbs');
    fs.writeText(path.join(dir, 'clone.json'), JSON.stringify(meta, null, 2));
    fs.writeText(vbs, launcherVbs(meta));
    const icon = path.join(dir, 'icon.ico');
    for (const lnk of lnksOf(meta.name)) {
      fs.mkdirp(path.dirname(lnk));
      writeShortcut(lnk, {
        target: 'wscript.exe', args: `"${vbs}"`, icon: fs.exists(icon) ? icon : meta.exe,
        appUserModelId: appUserModelIdOf(meta.slug), description: meta.name,
      });
    }
  }

  return {
    list: async () => scan().map(({ slug, appPath, codexHome }) => ({ slug, appPath, codexHome })),

    async make(spec) {
      const location = await codexLocation();
      if (!location) throw new Error('没找到 Codex');
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
      write({ slug: spec.slug, name: spec.displayName, exe: path.join(location, 'app', 'Codex.exe'), codexHome, userData, zh: spec.zh });
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
      for (const clone of scan()) if (clone.meta.zh !== zh) write({ ...clone.meta, zh });
    },
  };
}
