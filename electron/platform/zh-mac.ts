// 汉化版 launcher on Mac. Owner: A10 (was A6).
// Adds <appsDir>/ChatGPT 汉化版.app: a tiny app (ChatGPT icon + 「中」 badge). Its executable is a shell script that runs
// Resources/zh-runner.js with CodexBuddy's own Electron in node mode (ELECTRON_RUN_AS_NODE). The runner opens ChatGPT.app
// with --remote-debugging-port=<random free port> (Electron binds it to 127.0.0.1 only), attaches over the DevTools
// protocol and turns OpenAI's enable_i18n switch on in every Codex page (the same patch codex.ps1's Windows launcher
// uses), then stays alive while Codex runs. Whatever fails, Codex still opens in English (L-06).
// ChatGPT.app is never modified (L-02). remove(): guardedRemove the launcher app only (L-04).
import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { guardedRemove } from '../core/guard';
import type { FileSystem } from '../core/types';
import { codexAppName } from './sandbox';
import type { Platform, ZhLauncher } from './types';

export type Exec = (cmd: string, args: string[]) => Promise<{ code: number; out: string }>;

export const realExec: Exec = (cmd, args) => new Promise(resolve => {
  execFile(cmd, args, { timeout: 60_000 }, (error, stdout) => {
    resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, out: String(stdout) });
  });
});

export interface MacZhDeps {
  exec: Exec;
  /** The program that runs zh-runner.js in node mode: CodexBuddy's own Electron (process.execPath) */
  nodeRunner: string;
}

/** How the runner starts Codex: `cmd ...args --remote-debugging-port=N` (main app: open -a; a clone: its real binary) */
export interface ZhRunnerConfig {
  cmd: string;
  args: string[];
  env?: Record<string, string>;
  /** Codex version; a failed patch turns the 汉化 off for this version only */
  version: string;
  /** Folder for disabled-<version> markers and the log */
  stateDir: string;
  /** pgrep -f pattern that matches the running Codex (already open → just bring it forward) */
  runningPattern: string;
  /** How long to wait for the debug port before giving up (ms) */
  waitMs?: number;
}

export const ZH_APP_EXECUTABLE = 'codexbuddy-zh';
export const zhStateDir = (buddyDir: string) => path.join(buddyDir, 'zh');
export const codexAppPath = (appsDir: string) => path.join(appsDir, codexAppName(appsDir));

const plistValue = (plist: string, key: string) =>
  new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist)?.[1] ?? null;

/** The installed Codex app's version and icon, read from its Info.plist; null when Codex is not installed */
export function readCodexApp(fs: FileSystem, app: string): { version: string; icon: string | null; executable: string } | null {
  const plist = fs.readText(path.join(app, 'Contents', 'Info.plist'));
  const version = plist && plistValue(plist, 'CFBundleShortVersionString');
  const executable = plist && plistValue(plist, 'CFBundleExecutable');
  if (!version || !executable) return null;
  const iconName = plistValue(plist!, 'CFBundleIconFile');
  const icon = iconName ? path.join(app, 'Contents', 'Resources', /\.icns$/.test(iconName) ? iconName : `${iconName}.icns`) : null;
  return { version, icon: icon && fs.exists(icon) ? icon : null, executable };
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sh = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function infoPlist(name: string, id: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${xml(name)}</string>
  <key>CFBundleDisplayName</key><string>${xml(name)}</string>
  <key>CFBundleIdentifier</key><string>${xml(id)}</string>
  <key>CFBundleExecutable</key><string>${ZH_APP_EXECUTABLE}</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
`;
}

/** The launcher script: runs the runner when CodexBuddy's Electron is there, else opens Codex plainly (English) */
export function launcherScript(nodeRunner: string, plain: { cmd: string; args: string[] }): string {
  return `#!/bin/sh
# Opens ChatGPT with a Chinese interface (written by CodexBuddy). ChatGPT.app itself is not changed.
# When anything goes wrong it still opens ChatGPT, in English.
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
if [ -x ${sh(nodeRunner)} ]; then
  ELECTRON_RUN_AS_NODE=1 ${sh(nodeRunner)} "$RES/zh-runner.js" "$RES/zh.json" && exit 0
fi
exec ${[plain.cmd, ...plain.args].map(sh).join(' ')}
`;
}

/** Writes zh-runner.js + zh.json into dir (also used by A9: a clone's launcher runs the same runner, L-07) */
export function writeZhRunner(fs: FileSystem, dir: string, config: ZhRunnerConfig): void {
  fs.writeText(path.join(dir, 'zh-runner.js'), ZH_RUNNER_SOURCE);
  fs.writeText(path.join(dir, 'zh.json'), JSON.stringify(config, null, 2) + '\n');
}

/** ChatGPT icon with a red 「中」 badge, as an .icns (osascript + AppKit, sips, iconutil: all part of macOS) */
export async function makeBadgedIcon(exec: Exec, fs: FileSystem, sourceIcon: string, workDir: string, out: string): Promise<boolean> {
  const script = path.join(workDir, 'badge.js');
  const png = path.join(workDir, 'icon.png');
  const iconset = path.join(workDir, 'AppIcon.iconset');
  fs.writeText(script, BADGE_SCRIPT);
  fs.mkdirp(iconset);
  if ((await exec('/usr/bin/osascript', ['-l', 'JavaScript', script, sourceIcon, png])).code !== 0) return false;
  fs.copy(png, path.join(iconset, 'icon_512x512@2x.png'));
  for (const size of [256, 128, 32]) {
    await exec('/usr/bin/sips', ['-z', String(size), String(size), png, '--out', path.join(iconset, `icon_${size}x${size}.png`)]);
  }
  return (await exec('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', out])).code === 0;
}

/** Whether a Codex app is running (L-05): any process whose command line is inside <app>/Contents/MacOS/ */
export async function isMacCodexRunning(exec: Exec, app: string): Promise<boolean> {
  return (await exec('/usr/bin/pgrep', ['-f', `${app}/Contents/MacOS/`])).code === 0;
}

export function createMacZh(platform: Platform, deps: Partial<MacZhDeps> = {}): ZhLauncher {
  const { fs, paths } = platform;
  const exec = deps.exec ?? realExec;
  const nodeRunner = deps.nodeRunner ?? process.execPath;
  const app = codexAppPath(paths.appsDir);
  const dest = paths.zhLauncherPath;
  const stateDir = zhStateDir(paths.buddyDir);
  const remove = (target: string) => guardedRemove(fs, target, paths.protectedRoots());

  return {
    exists: async () => fs.exists(path.join(dest, 'Contents', 'MacOS', ZH_APP_EXECUTABLE)),

    supported: async () => {
      const codex = readCodexApp(fs, app);
      return !!codex && !fs.exists(path.join(stateDir, `disabled-${codex.version}`));
    },

    add: async () => {
      const codex = readCodexApp(fs, app);
      if (!codex) throw new Error('没找到 Codex');
      const contents = path.join(dest, 'Contents');
      const resources = path.join(contents, 'Resources');
      const executable = path.join(contents, 'MacOS', ZH_APP_EXECUTABLE);
      // Choosing 汉化版 again means trying again, even if it was turned off for this Codex version
      remove(path.join(stateDir, `disabled-${codex.version}`));
      fs.writeText(path.join(contents, 'Info.plist'), infoPlist('ChatGPT 汉化版', 'app.codexbuddy.zh'));
      fs.writeText(path.join(contents, 'PkgInfo'), 'APPL????');
      const plain = { cmd: '/usr/bin/open', args: ['-a', app] };
      writeZhRunner(fs, resources, {
        cmd: plain.cmd, args: [...plain.args, '--args'], version: codex.version, stateDir,
        runningPattern: `${app}/Contents/MacOS/`,
      });
      fs.writeText(executable, launcherScript(nodeRunner, plain));
      await exec('/bin/chmod', ['755', executable]);
      const icon = path.join(resources, 'AppIcon.icns');
      if (codex.icon) {
        const work = path.join(stateDir, 'icon-work');
        const badged = await makeBadgedIcon(exec, fs, codex.icon, work, icon).catch(() => false);
        if (!badged) fs.copy(codex.icon, icon);
        remove(work);
      }
      // Finder caches bundle info; touching the bundle makes it pick up the new icon
      await exec('/usr/bin/touch', [dest]);
    },

    remove: async () => remove(dest),
  };
}

// Draws the badge: argv = [source icon, output png]. Runs under `osascript -l JavaScript`
export const BADGE_SCRIPT = `ObjC.import('AppKit');
function run(argv) {
  const src = $.NSImage.alloc.initWithContentsOfFile(argv[0]);
  if (!src || src.isNil()) throw new Error('no icon');
  const S = 1024;
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(null, S, S, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
  src.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, S, S), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1);
  const d = 360, x = S - d - 70, y = 70;
  $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.878, 0.18, 0.165, 1).setFill;
  $.NSBezierPath.bezierPathWithOvalInRect($.NSMakeRect(x, y, d, d)).fill;
  const attrs = $.NSMutableDictionary.alloc.init;
  attrs.setObjectForKey($.NSFont.boldSystemFontOfSize(220), $.NSFontAttributeName);
  attrs.setObjectForKey($.NSColor.whiteColor, $.NSForegroundColorAttributeName);
  const text = $.NSString.alloc.initWithUTF8String('中');
  const size = text.sizeWithAttributes(attrs);
  text.drawAtPointWithAttributes($.NSMakePoint(x + (d - size.width) / 2, y + (d - size.height) / 2), attrs);
  $.NSGraphicsContext.restoreGraphicsState;
  if (!rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $()).writeToFileAtomically(argv[1], true)) throw new Error('write failed');
}
`;

// The runner, written to disk as is so anyone can read what it does. Plain Node (22+: global WebSocket, fetch).
// argv[2] = zh.json (ZhRunnerConfig). Exit code 0 always means Codex was opened (patched or plain).
export const ZH_RUNNER_SOURCE = `'use strict';
// Opens Codex with a Chinese interface (written by CodexBuddy).
// Codex shows translations only when OpenAI's feature switch enable_i18n (Statsig layer 72216192) is on; where OpenAI
// is unreachable it stays off and the UI is English. So start Codex with a DevTools port on 127.0.0.1 (a random free
// port each time), patch that one switch in every Codex page, and stay alive while Codex runs.
// Nothing runs in the background after Codex quits. If the patch cannot be applied, Codex still opens in English and
// the patch stays off for that Codex version (disabled-<version>).
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const env = { ...process.env, ...(config.env || {}) };
delete env.ELECTRON_RUN_AS_NODE;
const log = (text) => { try { fs.mkdirSync(config.stateDir, { recursive: true }); fs.appendFileSync(path.join(config.stateDir, 'zh.log'), new Date().toISOString() + '  ' + text + '\\n'); } catch (e) { } };
const start = (extra) => { const child = spawn(config.cmd, [...config.args, ...extra], { env, detached: true, stdio: 'ignore' }); child.unref(); };
const disabled = path.join(config.stateDir, 'disabled-' + config.version);

const PATCH = ${JSON.stringify(`(() => {
  if (window.__codexBuddyZh) return;
  window.__codexBuddyZh = true;
  const LAYER = '72216192';
  const fixValue = (value) => {
    try {
      if (!value || typeof value.get !== 'function' || value.__codexBuddyZh) return;
      const get = value.get;
      value.get = function (key, fallback) { return key === 'enable_i18n' ? true : get.call(this, key, fallback); };
      value.__codexBuddyZh = true;
    } catch (e) { }
  };
  const wrap = (original) => {
    if (typeof original !== 'function' || original.__codexBuddyZh) return original;
    const wrapped = function (layerName) {
      const value = original.apply(this, arguments);
      if (layerName === LAYER) fixValue(value);
      return value;
    };
    wrapped.__codexBuddyZh = true;
    return wrapped;
  };
  const fixClient = (client) => {
    if (!client || typeof client !== 'object' || client.__codexBuddyZh) return;
    client.__codexBuddyZh = true;
    for (const name of ['getLayer', 'getDynamicConfig']) {
      let current = wrap(client[name]);
      Object.defineProperty(client, name, { configurable: true, get: () => current, set: (next) => { current = next; try { current = wrap(next); } catch (e) { } } });
    }
  };
  const fixAll = (root) => {
    try {
      fixClient(root.firstInstance);
      if (root.instances) Object.values(root.instances).forEach(fixClient);
    } catch (e) { }
  };
  const fixRoot = (root) => {
    try {
      if (!root || typeof root !== 'object' || root.__codexBuddyZh) return;
      root.__codexBuddyZh = true;
      for (const key of ['firstInstance', 'instances']) {
        let current = root[key];
        Object.defineProperty(root, key, { configurable: true, enumerable: true, get: () => current, set: (next) => { current = next; fixAll(root); } });
      }
      fixAll(root);
    } catch (e) { }
  };
  let root = window.__STATSIG__;
  fixRoot(root);
  try { Object.defineProperty(window, '__STATSIG__', { configurable: true, get: () => root, set: (next) => { root = next; fixRoot(next); } }); } catch (e) { }
})();`)};

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (fs.existsSync(disabled)) { log('patch off for ' + config.version + ': opening plainly'); start([]); return; }
  if (spawnSync('/usr/bin/pgrep', ['-f', config.runningPattern]).status === 0) {
    // Never close a running Codex: bring it forward as it is (CodexBuddy asks the user to reopen it, L-05)
    log('codex already running: bringing it forward'); start([]); return;
  }
  const port = await freePort();
  start(['--remote-debugging-port=' + port]);
  let wsUrl = null;
  const deadline = Date.now() + (config.waitMs || 30000);
  while (!wsUrl && Date.now() < deadline) {
    try { wsUrl = (await (await fetch('http://127.0.0.1:' + port + '/json/version')).json()).webSocketDebuggerUrl; } catch (e) { await sleep(250); }
  }
  if (!wsUrl) { log('no devtools port: patch off for ' + config.version); fs.writeFileSync(disabled, 'devtools port did not answer\\n'); return; }
  const socket = new WebSocket(wsUrl);
  let id = 0;
  const send = (method, params, sessionId) => socket.send(JSON.stringify({ id: ++id, method, params: params || {}, ...(sessionId ? { sessionId } : {}) }));
  await new Promise((resolve) => {
    socket.onopen = () => { send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }); log('attached on port ' + port); };
    socket.onmessage = (event) => {
      let message; try { message = JSON.parse(event.data); } catch (e) { return; }
      if (message.method !== 'Target.attachedToTarget') return;
      const { sessionId, targetInfo, waitingForDebugger } = message.params;
      if (targetInfo.type === 'page') {
        send('Page.enable', {}, sessionId);
        send('Page.addScriptToEvaluateOnNewDocument', { source: PATCH }, sessionId);
        if (!waitingForDebugger) send('Runtime.evaluate', { expression: PATCH }, sessionId);
        log('patched page ' + targetInfo.url);
      }
      if (waitingForDebugger) send('Runtime.runIfWaitingForDebugger', {}, sessionId);
    };
    socket.onclose = () => resolve();
    socket.onerror = () => resolve();
  });
  log('codex closed');
}
main().then(() => process.exit(0), (e) => { log('failed: ' + (e && e.message)); try { start([]); } catch (x) { } process.exit(0); });
`;
