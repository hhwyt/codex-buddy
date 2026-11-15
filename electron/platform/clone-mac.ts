// 分身 on Mac. Owner: A9. Port of ~/.claude/skills/codex-deepseek-fork/scripts/install.sh:
//   cp -c (APFS clone) ChatGPT.app → <appsDir>/<Name>.app; Info.plist CFBundleName/DisplayName/Identifier
//   (local.codexbuddy.<slug>) and icon from the vendor logo (sips + iconutil); main executable replaced by a launcher
//   that sets CODEX_HOME=~/.codex-<slug>, CODEX_ELECTRON_USER_DATA_PATH + --user-data-dir
//   (~/Library/Application Support/Codex (<Name>)), CODEX_SPARKLE_ENABLED=false, --use-mock-keychain; then
//   codesign --force --deep -s - (ad-hoc, no hardened runtime). Key comes from CodexBuddy itself, no third-party switcher.
// The original app is only read (cp -c), never written. remove(): guardedRemove the .app only (C-07).
// Tests run against sandbox paths with a fake .app; OS commands go through an injectable runner.
import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { guardedRemove } from '../core/guard';
import type { Clone, CloneInfo, CloneSpec, Platform } from './types';

/** Runs one OS command, resolves stdout, rejects on a non-zero exit */
export type CommandRunner = (cmd: string, args: string[]) => Promise<string>;

export const runCommand: CommandRunner = (cmd, args) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) =>
      error ? reject(new Error(`${cmd} failed: ${String(stderr || error.message).trim()}`)) : resolve(String(stdout)));
  });

export interface MacCloneDeps {
  run?: CommandRunner;
  /** The Codex app to clone; defaults to platform.findCodex() */
  sourceApp?: () => Promise<string | null>;
}

export const CLONE_LAUNCHER = 'codexbuddy-launcher';
const MARKER = '# codexbuddy-clone ';
const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
const ICON_SIZES = [16, 32, 128, 256, 512];

/** What the launcher remembers about its clone (first comment line, JSON) */
export interface MacCloneMeta {
  slug: string;
  name: string;
  exe: string;
  codexHome: string;
  userData: string;
  zh: boolean;
}

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function launcherScript(meta: MacCloneMeta): string {
  const zhArgs = meta.zh ? ' --remote-debugging-address=127.0.0.1 --remote-debugging-port=0' : '';
  return [
    '#!/bin/bash',
    MARKER + JSON.stringify(meta),
    `export CODEX_HOME=${shq(meta.codexHome)}`,
    `export CODEX_ELECTRON_USER_DATA_PATH=${shq(meta.userData)}`,
    'export CODEX_SPARKLE_ENABLED=false',
    `export CODEXBUDDY_ZH=${meta.zh ? 1 : 0}`,
    `exec "$(dirname "$0")/"${shq(meta.exe)} --user-data-dir="$CODEX_ELECTRON_USER_DATA_PATH" --use-mock-keychain${zhArgs} "$@"`,
    '',
  ].join('\n');
}

export function parseLauncher(text: string | null): MacCloneMeta | null {
  const line = text?.split('\n').find(l => l.startsWith(MARKER));
  if (!line) return null;
  try {
    const meta = JSON.parse(line.slice(MARKER.length));
    return typeof meta?.slug === 'string' && typeof meta?.exe === 'string' ? meta : null;
  } catch {
    return null;
  }
}

export function createMacClone(platform: Platform, deps: MacCloneDeps = {}): Clone {
  const { fs, paths } = platform;
  const run = deps.run ?? runCommand;
  const sourceApp = deps.sourceApp ?? (async () => (await platform.findCodex())?.location ?? null);
  const roots = () => paths.protectedRoots();
  const launcherOf = (app: string) => path.join(app, 'Contents', 'MacOS', CLONE_LAUNCHER);
  const plistOf = (app: string) => path.join(app, 'Contents', 'Info.plist');

  const scan = (): Array<CloneInfo & { meta: MacCloneMeta }> =>
    fs.list(paths.appsDir)
      .filter(entry => entry.endsWith('.app'))
      .map(entry => {
        const appPath = path.join(paths.appsDir, entry);
        const meta = parseLauncher(fs.readText(launcherOf(appPath)));
        // A launcher that runs the main CODEX_HOME is Codex itself (the real-Codex sandbox copy), not a 分身
        return meta && meta.codexHome !== paths.codexHome && { slug: meta.slug, appPath, codexHome: meta.codexHome, meta };
      })
      .filter((c): c is CloneInfo & { meta: MacCloneMeta } => !!c);

  const plistSet = (plist: string, key: string, value: string) => run('plutil', ['-replace', key, '-string', value, plist]);
  const plistDelete = (plist: string, key: string) => run('plutil', ['-remove', key, plist]).catch(() => '');

  async function sign(app: string): Promise<void> {
    await run('xattr', ['-cr', app]).catch(() => '');
    await run('codesign', ['--force', '--deep', '--sign', '-', app]);
    await run(LSREGISTER, ['-f', app]).catch(() => '');
  }

  async function makeIcon(png: string, icns: string): Promise<boolean> {
    if (!fs.exists(png)) return false;
    const work = path.join(paths.buddyDir, 'icon-work', path.basename(icns, '.icns'));
    const iconset = path.join(work, 'icon.iconset');
    fs.mkdirp(iconset);
    try {
      for (const size of ICON_SIZES) {
        for (const scale of [1, 2]) {
          const px = String(size * scale);
          const file = path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`);
          await run('sips', ['-s', 'format', 'png', '-z', px, px, png, '--out', file]);
        }
      }
      await run('iconutil', ['-c', 'icns', iconset, '-o', icns]);
      return true;
    } catch {
      return false;
    } finally {
      guardedRemove(fs, work, roots());
    }
  }

  /** Where the clone goes: <Name>.app, or <Name> Codex.app when the user already has an unrelated <Name>.app */
  function targetApp(spec: CloneSpec, source: string): string {
    const plain = path.join(paths.appsDir, `${spec.displayName}.app`);
    const ours = (app: string) => parseLauncher(fs.readText(launcherOf(app)))?.slug === spec.slug;
    if (path.resolve(plain) !== path.resolve(source) && (!fs.exists(plain) || ours(plain))) return plain;
    return path.join(paths.appsDir, `${spec.displayName} Codex.app`);
  }

  return {
    list: async () => scan().map(({ slug, appPath, codexHome }) => ({ slug, appPath, codexHome })),

    async make(spec) {
      const source = await sourceApp();
      if (!source || !fs.exists(source)) throw new Error('没找到 Codex');
      const codexHome = paths.cloneHome(spec.slug);
      const userData = path.join(paths.home, 'Library', 'Application Support', `Codex (${spec.displayName})`);
      // C-08: an existing ~/.codex-<slug> and data dir are kept as they are, so old chats come back
      fs.mkdirp(codexHome);
      fs.mkdirp(userData);
      // Rebuild from a fresh copy: drop this vendor's old clone app (entry point only)
      for (const old of scan().filter(c => c.slug === spec.slug)) guardedRemove(fs, old.appPath, roots());
      const app = targetApp(spec, source);
      guardedRemove(fs, app, roots());
      fs.mkdirp(paths.appsDir);
      try {
        await run('cp', ['-cR', source, app]); // APFS clone: shares disk blocks with the original
      } catch {
        fs.copy(source, app);
      }
      const plist = plistOf(app);
      // Source already started by a CodexBuddy launcher (the real-Codex sandbox copy): use the binary it runs
      const exe = parseLauncher(fs.readText(launcherOf(app)))?.exe ?? (await run('plutil', ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', plist])).trim();
      await plistSet(plist, 'CFBundleName', spec.displayName);
      await plistSet(plist, 'CFBundleDisplayName', spec.displayName);
      await plistSet(plist, 'CFBundleIdentifier', `local.codexbuddy.${spec.slug}`);
      // Don't compete with the original for its URL schemes, file types or alternate names
      for (const key of ['CFBundleAlternateNames', 'CFBundleURLTypes', 'CFBundleDocumentTypes', 'UTExportedTypeDeclarations', 'LSHasLocalizedDisplayName']) {
        await plistDelete(plist, key);
      }
      const meta: MacCloneMeta = { slug: spec.slug, name: spec.displayName, exe, codexHome, userData, zh: spec.zh };
      fs.writeText(launcherOf(app), launcherScript(meta));
      await run('chmod', ['755', launcherOf(app)]);
      await plistSet(plist, 'CFBundleExecutable', CLONE_LAUNCHER);
      if (await makeIcon(spec.iconPng, path.join(app, 'Contents', 'Resources', `${spec.slug}.icns`))) {
        await plistDelete(plist, 'CFBundleIconName');
        await plistSet(plist, 'CFBundleIconFile', `${spec.slug}.icns`);
      }
      await sign(app);
      return { slug: spec.slug, appPath: app, codexHome };
    },

    async open(slug) {
      const clone = scan().find(c => c.slug === slug);
      if (!clone) throw new Error('这个分身还没做');
      await run('open', [clone.appPath]);
    },

    async remove(slug) {
      for (const clone of scan().filter(c => c.slug === slug)) {
        await run(LSREGISTER, ['-u', clone.appPath]).catch(() => '');
        guardedRemove(fs, clone.appPath, roots());
      }
    },

    async setZh(zh) {
      for (const clone of scan()) {
        if (clone.meta.zh === zh) continue;
        fs.writeText(launcherOf(clone.appPath), launcherScript({ ...clone.meta, zh }));
        await run('chmod', ['755', launcherOf(clone.appPath)]);
        await sign(clone.appPath);
      }
    },
  };
}
