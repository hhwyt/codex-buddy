// Mac platform. Owner: A2.
// Codex on Mac = /Applications/ChatGPT.app (bundle id com.openai.codex); CLI at
// Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex (spike (a)). Install = download the official dmg and
// copy the app into /Applications (never in tests: sandbox paths put it at <sandbox>/Applications/ChatGPT.app).
// Never modify ChatGPT.app. 还原 removes Codex only when CodexBuddy installed it (marker file), always through guard.ts.
import { execFile } from 'node:child_process';
import * as nfs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { guardedRemove } from '../core/guard';
import { nodeFs } from './node-fs';
import { codexRunner } from './run-codex';
import { codexAppName, sandboxExec, TEST_CODEX_BUNDLE_ID } from './sandbox';
import type { CodexInstall, InstallProgress, Paths, Platform } from './types';

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
export const MAC_CODEX_BUNDLE_ID = 'com.openai.codex';
/** OpenAI's Developer ID TeamIdentifier for the official ChatGPT/Codex app. Measured on the build machine (2026-11-20):
 *  /usr/bin/codesign -dv --verbose=2 /Applications/ChatGPT.app 2>&1 | grep TeamIdentifier
 *  => TeamIdentifier=2DC432GLL2
 */
export const OPENAI_TEAM_ID = '2DC432GLL2';
/** Shown on the install progress when the downloaded Codex app is not signed by OpenAI */
export const SIGNATURE_MISMATCH_REASON = '下载的 Codex 签名不对，没有安装';
/** Official Codex dmg (overridable: CODEXBUDDY_ENDPOINTS {"codexDownload": "..."} or deps.downloadUrl) */
export const MAC_CODEX_DMG_URL = 'https://persistent.oaistatic.com/codex-app-prod/Codex.dmg';
export const macCli = (app: string) => path.join(app, 'Contents', 'Resources', 'codex-cli', 'CodexCLI.app', 'Contents', 'MacOS', 'codex');

/** Where Codex lives: /Applications/ChatGPT.app, or <sandbox>/Applications/Test-ChatGPT.app in a sandbox */
export const macCodexAppPath = (paths: Paths) => path.join(paths.appsDir, codexAppName(paths.appsDir));

/** pgrep -f pattern for "a process of this Codex app runs": the bundle's own Contents/MacOS/ path, regex-escaped, so
 *  it never matches another copy (the user's /Applications/ChatGPT.app next to a sandbox or clone copy) */
export const macRunningPattern = (app: string) => `${app}/Contents/MacOS/`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type Exec = (cmd: string, args: string[]) => Promise<{ code: number; stdout: string }>;

export const realExec: Exec = (cmd, args) => new Promise(resolve => {
  // codesign -dv prints the designations to stderr; keep them so signature checks can read TeamIdentifier
  execFile(cmd, args, { timeout: 10 * 60_000 }, (err, stdout, stderr) => {
    resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: `${String(stdout ?? '')}${String(stderr ?? '')}` });
  });
});

export interface MacDeps {
  exec: Exec;
  fetch: typeof fetch;
  downloadUrl: string;
}

export function downloadUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  try {
    const u = JSON.parse(env.CODEXBUDDY_ENDPOINTS || '{}').codexDownload;
    if (typeof u === 'string' && u) return u;
  } catch { /* fall through */ }
  return MAC_CODEX_DMG_URL;
}

/** Reads one key of an Info.plist: XML text first, then plutil (binary plists). null when unreadable */
export async function plistValue(plist: string, key: string, exec: Exec): Promise<string | null> {
  const text = nodeFs.readText(plist);
  if (text === null) return null;
  const m = text.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  if (m) return m[1];
  const r = await exec('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist]);
  return r.code === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

/** Downloads url into file, resuming from file.part (O-07). A finished file is never fetched again. onPercent gets the
 *  whole file's 0–100 each time it moves by at least 1 (only when the server says how big the file is) */
export async function resumableDownload(url: string, file: string, doFetch: typeof fetch, onPercent?: (pct: number) => void): Promise<void> {
  if (nfs.existsSync(file)) return;
  const part = `${file}.part`;
  nfs.mkdirSync(path.dirname(file), { recursive: true });
  const have = nfs.existsSync(part) ? nfs.statSync(part).size : 0;
  const res = await doFetch(url, { headers: have ? { Range: `bytes=${have}-` } : {} });
  if (res.status === 416 && have) { nfs.renameSync(part, file); return; }
  if (!res.ok || !res.body) throw new Error(`download http ${res.status}`);
  const append = res.status === 206 && have > 0;
  const out = nfs.createWriteStream(part, { flags: append ? 'a' : 'w' });
  let got = append ? have : 0;
  const length = res.headers.get('content-length');
  const total = length === null ? 0 : got + Number(length);
  let shown = -1;
  const report = () => {
    if (!onPercent || total <= 0) return;
    const pct = Math.min(100, Math.floor((got / total) * 100));
    if (pct !== shown) { shown = pct; onPercent(pct); }
  };
  report();
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      report();
      if (!out.write(value)) await new Promise<void>(r => out.once('drain', () => r()));
    }
  } finally {
    await new Promise<void>(r => out.end(r));
  }
  nfs.renameSync(part, file);
}

export function createMacPlatform(paths: Paths = macPaths(), deps: Partial<MacDeps> = {}): Platform {
  const sandboxed = paths.appsDir !== '/Applications';
  // In a sandbox `open` is recorded instead of run, so e2e never launches anything
  const exec = deps.exec ?? (sandboxed ? sandboxExec(path.join(paths.buddyDir, 'sandbox-open.log'), realExec) : realExec);
  const doFetch = deps.fetch ?? fetch;
  const downloadUrl = deps.downloadUrl ?? downloadUrlFromEnv();
  const app = macCodexAppPath(paths);
  const roots = paths.protectedRoots();
  const downloads = path.join(paths.buddyDir, 'downloads');
  const dmg = path.join(downloads, 'Codex.dmg');
  /** Present only when CodexBuddy installed Codex itself; 还原 uninstalls nothing without it */
  const marker = path.join(paths.buddyDir, 'installed-codex.json');

  const isCodexRunning = async () => (await exec('/usr/bin/pgrep', ['-f', macRunningPattern(app)])).code === 0;

  const findCodex = async (): Promise<CodexInstall | null> => {
    if (!nodeFs.exists(app)) return null;
    const plist = path.join(app, 'Contents', 'Info.plist');
    const id = await plistValue(plist, 'CFBundleIdentifier', exec);
    // Unreadable bundle id: treat it as installed, never overwrite (O-02)
    if (id !== null && id !== (sandboxed ? TEST_CODEX_BUNDLE_ID : MAC_CODEX_BUNDLE_ID)) return null;
    const version = (await plistValue(plist, 'CFBundleShortVersionString', exec)) ?? '';
    return { version, location: app, cli: macCli(app), running: await isCodexRunning() };
  };

  /** The downloaded Codex must be signed by OpenAI before it is copied into place: codesign --verify, then read TeamIdentifier */
  const verifyCodexSignature = async (candidate: string): Promise<boolean> => {
    if ((await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', candidate])).code !== 0) return false;
    const detail = await exec('/usr/bin/codesign', ['-dv', '--verbose=2', candidate]);
    return detail.code === 0 && new RegExp(`TeamIdentifier=${OPENAI_TEAM_ID}\\b`).test(detail.stdout);
  };

  /** Mounts the dmg, copies the first .app into place (via a temp name, then rename), detaches */
  const copyFromDmg = async () => {
    const mnt = path.join(paths.buddyDir, 'mnt');
    nodeFs.mkdirp(mnt);
    const attach = await exec('/usr/bin/hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mnt]);
    if (attach.code !== 0) {
      guardedRemove(nodeFs, dmg, roots); // a broken dmg is fetched again next time
      throw new Error('mount');
    }
    try {
      const name = nodeFs.list(mnt).find(f => f.endsWith('.app'));
      if (!name) throw new Error('no app in dmg');
      if (!(await verifyCodexSignature(path.join(mnt, name)))) throw new Error('signature-mismatch');
      const tmp = `${app}.partial`;
      guardedRemove(nodeFs, tmp, roots);
      if ((await exec('/usr/bin/ditto', [path.join(mnt, name), tmp])).code !== 0) throw new Error('copy');
      nfs.renameSync(tmp, app);
      // Copied by ditto, not the Finder: tell LaunchServices so Launchpad finds it right away (11-16, 启动台搜不到)
      if (!sandboxed) await exec('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', app]);
    } finally {
      await exec('/usr/bin/hdiutil', ['detach', mnt, '-force']);
    }
  };

  const installCodex = async (progress: InstallProgress) => {
    let step = 'download';
    try {
      if (nodeFs.exists(app)) {
        // Already there (ours, someone else's, or unreadable): never overwrite
        progress({ id: 'download', state: 'done', text: 'Codex 已装好' });
        return (await findCodex()) ? { ok: true } : { ok: false, reason: '应用程序里已有同名的 App，没有覆盖它' };
      }
      // 演示模式 (product videos): off unless CodexBuddy was started with --demo-mode
      // (`open -a CodexBuddy --args --demo-mode`). Then ~/.codexbuddy/demo-fast-install names a ChatGPT.app already on
      // disk; the download ring runs 0→100 in ~6 s and that copy is put in place instead of downloading.
      const demoApp = sandboxed || !demoModeOn(process.argv) ? null : nodeFs.readText(path.join(os.homedir(), '.codexbuddy', 'demo-fast-install'))?.trim();
      if (demoApp && nodeFs.exists(demoApp)) {
        progress({ id: 'download', state: 'start', text: '下载 Codex 0%' });
        for (let pct = 5; pct <= 100; pct += 5) {
          await new Promise(r => setTimeout(r, 300));
          progress({ id: 'download', state: 'start', text: `下载 Codex ${pct}%` });
        }
        progress({ id: 'download', state: 'done', text: '下载 Codex' });
        step = 'copy';
        progress({ id: 'copy', state: 'start', text: '装进应用程序' });
        const tmp = `${app}.partial`;
        guardedRemove(nodeFs, tmp, roots);
        if ((await exec('/usr/bin/ditto', [demoApp, tmp])).code !== 0) throw new Error('copy');
        nfs.renameSync(tmp, app);
        await exec('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', app]);
        nodeFs.writeText(marker, JSON.stringify({ app }));
        progress({ id: 'copy', state: 'done', text: '装进应用程序' });
        step = 'check';
        progress({ id: 'check', state: 'start', text: '检查 Codex' });
        if (!(await findCodex())) throw new Error('check');
        progress({ id: 'check', state: 'done', text: '检查 Codex' });
        return { ok: true };
      }
      progress({ id: 'download', state: 'start', text: '下载 Codex' });
      await resumableDownload(downloadUrl, dmg, doFetch, pct => progress({ id: 'download', state: 'start', text: `下载 Codex ${pct}%` }));
      progress({ id: 'download', state: 'done', text: '下载 Codex' });
      step = 'copy';
      progress({ id: 'copy', state: 'start', text: '装进应用程序' });
      await copyFromDmg();
      nodeFs.writeText(marker, JSON.stringify({ app }));
      progress({ id: 'copy', state: 'done', text: '装进应用程序' });
      step = 'check';
      progress({ id: 'check', state: 'start', text: '检查 Codex' });
      if (!(await findCodex())) throw new Error('check');
      guardedRemove(nodeFs, dmg, roots);
      progress({ id: 'check', state: 'done', text: '检查 Codex' });
      return { ok: true };
    } catch (err) {
      const reason = step === 'download' ? '下载没成功，检查一下网络再试'
        : err instanceof Error && err.message === 'signature-mismatch' ? SIGNATURE_MISMATCH_REASON
        : step === 'copy' ? '没能装进应用程序'
        : '装好的 Codex 打不开';
      progress({ id: step, state: 'fail', text: reason });
      return { ok: false, reason };
    }
  };

  const uninstallCodex = async () => {
    // Codex that was there before CodexBuddy is never uninstalled
    if (!nodeFs.exists(marker)) return { ok: true };
    if (await isCodexRunning()) return { ok: false, reason: '先退出 Codex 再还原' };
    guardedRemove(nodeFs, app, roots);
    guardedRemove(nodeFs, downloads, roots);
    guardedRemove(nodeFs, marker, roots);
    return { ok: true };
  };

  const openCodex: Platform['openCodex'] = async ({ zh }) => {
    const target = zh && nodeFs.exists(paths.zhLauncherPath) ? paths.zhLauncherPath : app;
    if ((await exec('/usr/bin/open', [target])).code !== 0) throw new Error('没能重新打开 ChatGPT');
  };

  const restartCodex: Platform['restartCodex'] = async opts => {
    if (!(await findCodex())) throw new Error('没找到 ChatGPT');
    if (await isCodexRunning()) {
      const quit = await exec('/usr/bin/osascript', ['-e', 'on run argv', '-e', 'with timeout of 5 seconds',
        '-e', 'tell application (item 1 of argv) to quit', '-e', 'end timeout', '-e', 'end run', app]);
      if (quit.code !== 0) throw new Error('没能退出 ChatGPT，请先保存任务并退出后重试');
      for (let i = 0; i < 20 && await isCodexRunning(); i++) await new Promise(r => setTimeout(r, 250));
      if (await isCodexRunning()) throw new Error('ChatGPT 还没有退出，请先保存任务并退出后重试');
    }
    await openCodex(opts);
    for (let i = 0; i < 40; i++) {
      if (await isCodexRunning()) return;
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error('没能重新打开 ChatGPT');
  };

  return {
    os: 'mac', paths, fs: nodeFs,
    findCodex, installCodex, uninstallCodex,
    runCodex: (args, opts) => codexRunner(macCli(app))(args, opts),
    openCodex, restartCodex,
    isCodexRunning,
    revealInFolder: async target => { await exec('/usr/bin/open', ['-R', target]); },
  };
}

/** 演示模式 is on only when CodexBuddy was launched with --demo-mode; a file alone never turns it on */
export const demoModeOn = (argv: readonly string[]): boolean => argv.includes('--demo-mode');
