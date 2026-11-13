// Sandbox stand-ins for the parts of Codex that cannot run in tests (CODEXBUDDY_SANDBOX runs only; never used on a
// real machine). They follow the e2e seams listed in test/e2e/launch.ts:
//   Codex installed = <sandbox>/Applications/Test-ChatGPT.app exists; its CLI is the fake Codex (CODEXBUDDY_FAKE_CODEX run by
//   CODEXBUDDY_NODE); Codex running = <sandbox>/fake-codex-running exists; install outcome = CODEXBUDDY_FAKE_INSTALL
//   (ok | fail-once | fail | fix | dmg = the real installer against a fake dmg server); 汉化 support = CODEXBUDDY_FAKE_ZH=unsupported; opening an app or revealing a file goes
//   through the injected opener / revealer (Electron shell, captured by e2e) so nothing is ever launched.
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { guardedRemove } from '../core/guard';
import type { CodexRunner } from '../core/types';
import { TEST_CODEX_BUNDLE_ID } from './sandbox';
import type { Clone, CodexInstall, Platform, ZhLauncher } from './types';

export interface SandboxSeams {
  root: string;
  env: NodeJS.ProcessEnv;
  open(target: string): Promise<void>;
  reveal(target: string): Promise<void>;
}

const plist = (version: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${TEST_CODEX_BUNDLE_ID}</string>` +
  `<key>CFBundleName</key><string>Test-ChatGPT</string><key>CFBundleExecutable</key><string>ChatGPT</string>` +
  `<key>SUEnableAutomaticChecks</key><false/>` +
  `<key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>\n`;

/** Runs the fake Codex CLI (node script) with CODEX_HOME set; same contract as platform/run-codex.ts */
export function fakeCodexRunner(node: string, script: string, extraEnv: NodeJS.ProcessEnv = {}): CodexRunner {
  return (args, { codexHome, timeoutMs, stopEarly }) => new Promise(resolve => {
    const child = spawn(node, [script, ...args], {
      cwd: codexHome, env: { ...process.env, ...extraEnv, ELECTRON_RUN_AS_NODE: '1', CODEX_HOME: codexHome }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '', timedOut = false;
    child.stdout.on('data', c => { out += c; });
    child.stderr.on('data', c => { err += c; if (stopEarly?.(err)) child.kill(); });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.on('error', e => { clearTimeout(timer); resolve({ out, err: err + String(e), timedOut }); });
    child.on('close', () => { clearTimeout(timer); resolve({ out, err, timedOut }); });
  });
}

export function sandboxPlatform(base: Platform, seams: SandboxSeams): Platform {
  const { fs, paths } = base;
  const app = path.join(seams.root, 'Applications', 'Test-ChatGPT.app');
  const runningFlag = path.join(seams.root, 'fake-codex-running');
  const downloads = path.join(paths.buddyDir, 'downloads');
  const failedOnce = path.join(downloads, '.failed-once');
  const marker = path.join(paths.buddyDir, 'installed-codex.json');
  const runCodex = fakeCodexRunner(seams.env.CODEXBUDDY_NODE || process.execPath, seams.env.CODEXBUDDY_FAKE_CODEX || '', { FAKE_CODEX_LOG: seams.env.FAKE_CODEX_LOG });
  const isCodexRunning = async () => fs.exists(runningFlag);

  const findCodex = async (): Promise<CodexInstall | null> => {
    const text = fs.readText(path.join(app, 'Contents', 'Info.plist'));
    if (text === null) return null;
    const version = /CFBundleShortVersionString<\/key>\s*<string>([^<]*)/.exec(text)?.[1] ?? '';
    return { version, location: app, cli: seams.env.CODEXBUDDY_FAKE_CODEX || '', running: await isCodexRunning() };
  };

  const installCodex: Platform['installCodex'] = async progress => {
    if (await findCodex()) { progress({ id: 'download', state: 'done', text: '已装好' }); return { ok: true }; }
    const mode = seams.env.CODEXBUDDY_FAKE_INSTALL || 'ok';
    // dmg: the real Mac installer (download, mount, ditto, check) against a fake download server holding Test-ChatGPT.app
    if (mode === 'dmg') return base.installCodex(progress);
    fs.mkdirp(downloads);
    progress({ id: 'download', state: 'start', text: '下载 Codex' });
    if (mode === 'fail' || (mode === 'fail-once' && !fs.exists(failedOnce))) {
      fs.writeText(path.join(downloads, 'Codex.dmg.part'), 'half');
      if (mode === 'fail-once') fs.writeText(failedOnce, '1');
      progress({ id: 'download', state: 'fail', text: '下载没成功，检查一下网络再试' });
      return { ok: false, reason: '下载没成功，检查一下网络再试' };
    }
    // A finished download is reused, never fetched again (O-07)
    if (!fs.exists(path.join(downloads, 'Codex.dmg'))) fs.writeText(path.join(downloads, 'Codex.dmg'), 'fake dmg');
    progress({ id: 'download', state: 'done', text: '下载 Codex' });
    // Copying takes a moment, like the real one: lets e2e quit in the middle of an install
    await new Promise(r => setTimeout(r, Number(seams.env.CODEXBUDDY_FAKE_INSTALL_MS ?? 1500)));
    if (mode === 'fix') {
      progress({ id: 'fix-catalog', state: 'start', text: '模型清单不对，重新写一份' });
      await new Promise(r => setTimeout(r, 300));
      progress({ id: 'fix-catalog', state: 'done', text: '修好了' });
    }
    progress({ id: 'copy', state: 'start', text: '装进应用程序' });
    fs.writeText(path.join(app, 'Contents', 'Info.plist'), plist('26.1.0'));
    const exe = path.join(app, 'Contents', 'MacOS', 'ChatGPT');
    fs.writeText(exe, '#!/bin/sh\nexit 0\n');
    fs.writeText(marker, JSON.stringify({ app }));
    progress({ id: 'copy', state: 'done', text: '装进应用程序' });
    progress({ id: 'check', state: 'start', text: '检查 Codex' });
    progress({ id: 'check', state: 'done', text: '检查 Codex' });
    return { ok: true };
  };

  return {
    os: base.os, paths, fs, findCodex, installCodex, runCodex, isCodexRunning,
    uninstallCodex: async () => {
      if (!fs.exists(marker)) return { ok: true };
      if (await isCodexRunning()) return { ok: false, reason: '先退出 Codex 再还原' };
      guardedRemove(fs, app, paths.protectedRoots());
      guardedRemove(fs, marker, paths.protectedRoots());
      return { ok: true };
    },
    openCodex: async ({ zh }) => seams.open(zh && fs.exists(paths.zhLauncherPath) ? paths.zhLauncherPath : app),
    revealInFolder: target => seams.reveal(target),
  };
}

/** 汉化 in a sandbox: the real launcher code (it only writes files), with supported() following CODEXBUDDY_FAKE_ZH */
export function sandboxZh(base: ZhLauncher, env: NodeJS.ProcessEnv): ZhLauncher {
  return { ...base, supported: async () => env.CODEXBUDDY_FAKE_ZH !== 'unsupported' && base.supported() };
}

/** Opening a clone in a sandbox goes through the opener instead of `open` */
export function sandboxClone(base: Clone, open: (target: string) => Promise<void>): Clone {
  return {
    ...base,
    open: async slug => {
      const c = (await base.list()).find(x => x.slug === slug);
      if (!c) throw new Error('没有这个分身');
      await open(c.appPath);
    },
  };
}

/** 汉化 on Windows in a sandbox: codex.ps1 is never run (it would write the real desktop and Start menu); the
 *  edition switch only writes stand-in shortcuts at the sandbox's desktop and Start menu paths */
export function sandboxWinZhPs1(fs: Platform['fs'], paths: Platform['paths']): (env: Record<string, string>) => Promise<{ code: number; out: string }> {
  return async env => {
    if (env.CODEX_SETUP_ACTION === 'edition' && env.CODEX_SETUP_EDITION === 'zh') {
      for (const dir of [paths.desktopDir, paths.startMenuDir]) fs.writeText(path.join(dir, 'ChatGPT 汉化版.lnk'), 'sandbox zh launcher');
    }
    return { code: 0, out: '' };
  };
}
