// CodexBuddy main process entry: builds the real pieces and hands them to main/services.ts (every IPC handler).
// CODEXBUDDY_SANDBOX=<dir>: every path inside <dir> and Codex replaced by the sandbox stand-ins (tests, e2e).
// CODEXBUDDY_ENDPOINTS=<json>: external addresses pointed at fake servers (core/endpoints.ts).
import { app, safeStorage, session, shell, type BrowserWindow } from 'electron';
import * as path from 'node:path';
import { parseEndpoints, withEndpoints } from './core/endpoints';
import { PROVIDERS } from './core/providers';
import { validateRemote } from './core/remote';
import { startBridge } from './main/bridge-server';
import { BROWSER_PARTITION, browserHandlers, createRightBrowser, electronViewHost } from './main/browser';
import { aesCipher, loadDataKey, plainWrap } from './main/cipher';
import { registerIpc, sendEvent } from './main/ipc';
import type { ConnectionView } from './main/ipc-contract';
import { connections, defaultAllowedHosts, guardedFetch, installNetGuard } from './main/net';
import { createServices } from './main/services';
import { createMainWindow } from './main/window';
import { pickPlatform } from './platform';
import { createMacClone, runCommand } from './platform/clone-mac';
import { createWinClone } from './platform/clone-win';
import { sandboxRoot } from './platform/sandbox';
import { sandboxClone, sandboxPlatform, sandboxZh } from './platform/sandbox-codex';
import { createMacZh } from './platform/zh-mac';
import { createWinZh } from './platform/zh-win';
import type { Clone, Platform, ZhLauncher } from './platform/types';
import { vendorsWith } from './vendors';

const os: 'mac' | 'win' = process.platform === 'win32' ? 'win' : 'mac';
const sandbox = sandboxRoot();
let win: BrowserWindow | null = null;

// Keep Electron's own profile inside the sandbox too
if (sandbox) app.setPath('userData', path.join(sandbox, 'electron-user-data'));

const open = async (target: string) => { await shell.openPath(target); };
const reveal = async (target: string) => { shell.showItemInFolder(target); };

function buildPlatform(): { platform: Platform; clone: Clone; zh: ZhLauncher } {
  const base = pickPlatform();
  const platform = sandbox ? sandboxPlatform(base, { root: sandbox, env: process.env, open, reveal }) : base;
  // In a sandbox nothing is registered with LaunchServices
  const run = sandbox ? (cmd: string, args: string[]) => (cmd.endsWith('lsregister') ? Promise.resolve('') : runCommand(cmd, args)) : runCommand;
  let clone = os === 'mac' ? createMacClone(platform, { run }) : createWinClone(platform);
  let zh = os === 'mac' ? createMacZh(platform) : createWinZh(platform);
  if (sandbox) { clone = sandboxClone(clone, open); zh = sandboxZh(zh, process.env); }
  return { platform, clone, zh };
}

async function main(): Promise<void> {
  const { platform, clone, zh } = buildPlatform();
  const endpoints = parseEndpoints(process.env.CODEXBUDDY_ENDPOINTS);
  const providers = PROVIDERS.map(p => withEndpoints(p, endpoints));
  const vendors = vendorsWith(endpoints);
  const upstreams: Record<string, string> = {};
  const bridge = await startBridge(upstreams);
  const keyFile = path.join(platform.paths.buddyDir, 'data-key.bin');
  const wrap = sandbox || !safeStorage.isEncryptionAvailable() ? plainWrap : { encrypt: (b: Buffer) => safeStorage.encryptString(b.toString('base64')), decrypt: (b: Buffer) => Buffer.from(safeStorage.decryptString(b), 'base64') };
  const cipher = aesCipher(loadDataKey(platform.fs, keyFile, wrap));
  const bundled = validateRemote(platform.fs.readText(path.join(__dirname, '..', 'remote', 'config.json')) ?? '');
  if (!bundled) throw new Error('remote/config.json is broken');

  const rb = createRightBrowser(() => electronViewHost(win!), s => sendEvent(win, 'browser', s));
  const toView = (r: { host: string; allowed: boolean; at: number }): ConnectionView => ({ host: r.host, allowed: r.allowed, at: r.at });
  const connectionViews = () => { const c = connections(); return { app: c.app.map(toView), web: c.web.map(toView) }; };

  const services = createServices({
    platform, clone, zh, providers, vendors, browser: rb, cipher,
    bridge: {
      baseUrlFor: (vendor, upstream) => { upstreams[vendor] = upstream; return bridge.baseUrlFor(vendor); },
      isBridgeUrl: url => url.startsWith(bridge.url),
    },
    fetchText: async (url, timeoutMs) => {
      const r = await guardedFetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) throw new Error(String(r.status));
      return r.text();
    },
    fetchBytes: async url => {
      const r = await guardedFetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(String(r.status));
      return { type: r.headers.get('content-type') ?? 'image/png', data: new Uint8Array(await r.arrayBuffer()) };
    },
    remoteUrls: endpoints.remoteConfig, bundledRemote: bundled, version: app.getVersion(), os,
    now: () => Date.now(),
    emit: (event, payload) => sendEvent(win, event, payload),
    openExternal: url => shell.openExternal(url),
    clearBrowserData: () => session.fromPartition(BROWSER_PARTITION).clearStorageData(),
    connections: connectionViews,
    logoPng: vendor => path.join(__dirname, '..', 'ui', 'assets', 'logos', `${vendor}.png`),
    runInstaller: async file => { await shell.openPath(file); app.quit(); },
  });

  registerIpc({ ...services.handlers, ...browserHandlers(rb) });
  installNetGuard(() => [...defaultAllowedHosts(providers), ...Object.values(endpoints.vendors).map(u => new URL(u!).host)],
    () => sendEvent(win, 'connections', connectionViews()));

  win = createMainWindow(os);
  win.on('closed', () => { win = null; });
  win.webContents.once('did-finish-load', () => { void services.startup().catch(() => undefined); });
  const poll = setInterval(() => services.pollModel(), 2000);
  app.on('before-quit', () => { clearInterval(poll); void bridge.close(); });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(main).catch(e => { console.error(String(e)); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
