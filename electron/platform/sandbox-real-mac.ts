// Real-Codex test runs on Mac (CODEXBUDDY_SANDBOX + CODEXBUDDY_REAL_CODEX=1, no fake servers): every path stays in the
// sandbox, and Codex is a real copy of the user's ChatGPT.app made the way a 分身 is (clone-mac.ts): an APFS clone
// (cp -c) at <sandbox>/Applications/Test-ChatGPT.app, bundle id local.codexbuddy.test-chatgpt, ad-hoc signed, whose
// launcher sets CODEX_HOME=<sandbox>/home/.codex, its own --user-data-dir inside the sandbox, --use-mock-keychain and
// Sparkle off. So it runs next to the user's own ChatGPT.app, whatever opens it (CodexBuddy, the 汉化版, Finder).
// The user's /Applications/ChatGPT.app is only read (cp -c), ~/.codex is never used, "running" means the sandbox
// copy's own Contents/MacOS/ (mac.ts macRunningPattern), and nothing here quits or kills any process.
import * as path from 'node:path';
import { guardedRemove } from '../core/guard';
import { createMacClone, runCommand, type CommandRunner } from './clone-mac';
import { createMacPlatform, MAC_CODEX_APP, macCodexAppPath, realExec, type Exec } from './mac';
import { TEST_CODEX_BUNDLE_ID } from './sandbox';
import { createMacZh } from './zh-mac';
import type { Clone, Paths, Platform, ZhLauncher } from './types';

/** Slug and name of the sandbox copy: bundle id local.codexbuddy.<slug> = TEST_CODEX_BUNDLE_ID, app <name>.app */
export const SANDBOX_CODEX_SLUG = TEST_CODEX_BUNDLE_ID.replace('local.codexbuddy.', '');
export const SANDBOX_CODEX_NAME = 'Test-ChatGPT';

export interface RealSandboxMacDeps {
  /** OS commands for the copy (cp, plutil, codesign …) */
  run?: CommandRunner;
  /** pgrep / open */
  exec?: Exec;
  /** The user's Codex, only ever read */
  sourceApp?: string;
}

export function realSandboxMac(paths: Paths, deps: RealSandboxMacDeps = {}): { platform: Platform; clone: Clone; zh: ZhLauncher } {
  const run = deps.run ?? runCommand;
  const source = deps.sourceApp ?? MAC_CODEX_APP;
  const base = createMacPlatform(paths, { exec: deps.exec ?? realExec });
  const { fs } = base;
  const app = macCodexAppPath(paths);
  if (path.resolve(app) === path.resolve(source)) throw new Error('the sandbox copy would be the user\'s own Codex');
  /** Same marker mac.ts reads: 还原 removes the sandbox copy because CodexBuddy made it */
  const marker = path.join(paths.buddyDir, 'installed-codex.json');
  // The copy is a 分身 of ChatGPT.app whose CODEX_HOME is the sandbox's .codex (clone-mac.ts hides it from the 分身 list)
  const copier = createMacClone({ ...base, paths: { ...paths, cloneHome: () => paths.codexHome } }, { run, sourceApp: async () => source });

  const platform: Platform = {
    ...base,
    // 「安装 Codex」 = copy the user's ChatGPT.app into the sandbox; nothing is downloaded or written to /Applications
    installCodex: async progress => {
      if (await base.findCodex()) { progress({ id: 'download', state: 'done', text: 'Codex 已装好' }); return { ok: true }; }
      if (fs.exists(app)) { progress({ id: 'download', state: 'fail', text: '沙盒里已有同名的 App，没有覆盖它' }); return { ok: false, reason: '沙盒里已有同名的 App，没有覆盖它' }; }
      if (!fs.exists(source)) { progress({ id: 'copy', state: 'fail', text: '没找到 Codex' }); return { ok: false, reason: '没找到 Codex' }; }
      progress({ id: 'copy', state: 'start', text: '复制一份 Codex 到沙盒' });
      try {
        await copier.make({ slug: SANDBOX_CODEX_SLUG, displayName: SANDBOX_CODEX_NAME, iconPng: '', zh: false });
        fs.writeText(marker, JSON.stringify({ app }));
      } catch {
        guardedRemove(fs, app, paths.protectedRoots()); // half a copy would block the next try
        progress({ id: 'copy', state: 'fail', text: '没能复制 Codex' });
        return { ok: false, reason: '没能复制 Codex' };
      }
      progress({ id: 'copy', state: 'done', text: '复制一份 Codex 到沙盒' });
      if (!(await base.findCodex())) { progress({ id: 'check', state: 'fail', text: '复制的 Codex 打不开' }); return { ok: false, reason: '复制的 Codex 打不开' }; }
      progress({ id: 'check', state: 'done', text: '检查 Codex' });
      return { ok: true };
    },
  };
  // 分身 are copied from the sandbox copy and live in <sandbox>/Applications; 汉化版 opens the sandbox copy
  return { platform, clone: createMacClone(platform, { run }), zh: createMacZh(platform) };
}
