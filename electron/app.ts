// CodexBuddy main process entry: builds the real pieces and hands them to main/services.ts (every IPC handler).
// CODEXBUDDY_SANDBOX=<dir>: every path inside <dir> and Codex replaced by the sandbox stand-ins (tests, e2e).
// CODEXBUDDY_ENDPOINTS=<json>: external addresses pointed at fake servers (core/endpoints.ts).
// Real-vendor test runs (sandbox, no fake servers): CODEXBUDDY_REAL_CODEX=1 uses the real Codex next to the user's own
// (Windows: the Store package, platform/sandbox-real-win.ts; Mac: a copy of ChatGPT.app inside the sandbox,
// platform/sandbox-real-mac.ts, where open / reveal / external links really happen); CODEXBUDDY_LOGIN_WINDOWS=1 opens
// the six login pages at start and keeps <sandbox>/login-status.json up to date (which vendor is logged in).
import { app, net, safeStorage, session, shell, type BrowserWindow } from 'electron';
import * as nfs from 'node:fs';
import * as path from 'node:path';
import { parseEndpoints, withEndpoints } from './core/endpoints';
import { PROVIDERS } from './core/providers';
import { validateRemote } from './core/remote';
import { REMOTE_CONFIG_PUBLIC_KEY } from './core/remote-key';
import { startBridge } from './main/bridge-server';
import { BROWSER_PARTITION, browserHandlers, createRightBrowser, electronViewHost, openLoginWindows } from './main/browser';
import { debugSwitchesIn, debuggable, removeTestEnvironment } from './main/hardening';
import { checkInternet, NetworkGate, NETWORK_POLL_MS } from './main/network-gate';
import { aesCipher, loadDataKey } from './main/cipher';
import { registerIpc, sendEvent } from './main/ipc';
import type { ConnectionView } from './main/ipc-contract';
import { connections, defaultAllowedHosts, guardedFetch, installNetGuard, readBytes } from './main/net';
import { createServices } from './main/services';
import { createMainWindow } from './main/window';
import { pickPlatform } from './platform';
import { createMacClone, runCommand } from './platform/clone-mac';
import { createWinClone } from './platform/clone-win';
import { sandboxRoot } from './platform/sandbox';
import { sandboxClone, sandboxPlatform, sandboxWinZhPs1, sandboxZh } from './platform/sandbox-codex';
import { realSandboxMac } from './platform/sandbox-real-mac';
import { realSandboxWin } from './platform/sandbox-real-win';
import { createNodeWinShell } from './platform/win';
import { createMacZh } from './platform/zh-mac';
import { createWinZh } from './platform/zh-win';
import type { Clone, Platform, ZhLauncher } from './platform/types';
import { loginWindowTargets, vendorsWith } from './vendors';

const os: 'mac' | 'win' = process.platform === 'win32' ? 'win' : 'mac';
let win: BrowserWindow | null = null;

// Release builds: no debugging switch on our own command line, no DevTools (main/hardening.ts)
const packageMeta = JSON.parse(nfs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')) as { codexbuddyDebuggable?: unknown };
const allowDebug = debuggable(app.isPackaged, packageMeta);
removeTestEnvironment(process.env, allowDebug);
const sandbox = sandboxRoot();
if (!allowDebug && debugSwitchesIn(s => app.commandLine.hasSwitch(s)).length) app.exit(1);
if (!allowDebug) app.on('web-contents-created', (_e, wc) => { wc.on('devtools-opened', () => wc.closeDevTools()); });

// Keep Electron's own profile inside the sandbox too
if (sandbox) app.setPath('userData', path.join(sandbox, 'electron-user-data'));
// Test runs (sandbox + fake servers): the window stays off screen (m1-decisions 2026-11-13); on Windows an off-screen
// window counts as hidden and would stop painting, which screenshots need
const testMode = !!sandbox && !!process.env.CODEXBUDDY_ENDPOINTS;
const realCodex = !!sandbox && !testMode && process.env.CODEXBUDDY_REAL_CODEX === '1';
// WebRTC's mDNS responder listens on UDP 5353 on every network card, which makes Windows Firewall ask the user whether
// to let CodexBuddy onto public networks. Official pages get no local WebRTC ports anyway (browser.ts WEBRTC_POLICY)
app.commandLine.appendSwitch('disable-features', ['WebRtcHideLocalIpsWithMdns', ...(testMode ? ['CalculateNativeWinOcclusion'] : [])].join(','));
// No OS keychain (站主 11-16): Chromium's own cookie encryption ("codex-buddy Safe Storage") asked for the login
// password on every rebuild. A fixed in-app key instead, like Codex keeping its keys in plain files
if (process.platform === 'darwin') app.commandLine.appendSwitch('use-mock-keychain');

// In a sandbox nothing is ever opened or launched: every open / reveal / external link goes to <sandbox>/opened.log.
// Real-Codex runs on Mac are used by a person, so there they really happen (an installer still only goes to the log)
const record = (kind: 'open' | 'reveal' | 'external', target: string) =>
  nfs.appendFileSync(path.join(sandbox!, 'opened.log'), JSON.stringify({ kind, target }) + '\n');
const logOnly = !!sandbox && !(realCodex && os === 'mac');
const open = async (target: string) => { if (logOnly) record('open', target); else await shell.openPath(target); };
const reveal = async (target: string) => { if (logOnly) record('reveal', target); else shell.showItemInFolder(target); };
const openExternal = async (url: string) => { if (logOnly) record('external', url); else await shell.openExternal(url); };

function buildPlatform(): { platform: Platform; clone: Clone; zh: ZhLauncher } {
  const base = pickPlatform();
  // In a sandbox nothing is registered with LaunchServices
  const run = sandbox ? (cmd: string, args: string[]) => (cmd.endsWith('lsregister') ? Promise.resolve('') : runCommand(cmd, args)) : runCommand;
  if (realCodex && os === 'mac') return realSandboxMac(base.paths, { run });
  if (realCodex) {
    const local = process.env.LOCALAPPDATA || path.join(base.paths.home, 'AppData', 'Local');
    return realSandboxWin(base, {
      shell: createNodeWinShell(), appData: path.join(base.paths.home, 'AppData', 'Roaming'),
      alias: path.join(local, 'Microsoft', 'WindowsApps', 'chatgpt-desktop.exe'),
    });
  }
  const platform = sandbox ? sandboxPlatform(base, { root: sandbox, env: process.env, open, reveal }) : base;
  // Windows sandbox: clone data dirs under the sandbox's AppData, and codex.ps1 never runs
  const winAppData = path.join(platform.paths.home, 'AppData', 'Roaming');
  let clone = os === 'mac' ? createMacClone(platform, { run }) : createWinClone(platform, sandbox ? { appData: winAppData } : {});
  let zh = os === 'mac' ? createMacZh(platform) : createWinZh(platform, sandbox ? { runPs1: sandboxWinZhPs1(platform.fs, platform.paths) } : {});
  if (sandbox) { clone = sandboxClone(clone, open); zh = sandboxZh(zh, process.env); }
  return { platform, clone, zh };
}

async function main(): Promise<void> {
  const { platform, clone, zh } = buildPlatform();
  const endpoints = parseEndpoints(process.env.CODEXBUDDY_ENDPOINTS);
  const providers = PROVIDERS.map(p => withEndpoints(p, endpoints));
  const vendors = vendorsWith(endpoints);
  const upstreams: Record<string, string> = {};
  let network: NetworkGate;
  // Codex's traffic to the vendors goes through the whitelist and shows under 「CodexBuddy 连过的」 (S-04, S-05)
  const bridge = await startBridge(upstreams, { fetch: (async (url: string, init?: RequestInit) => {
    if (network?.state !== 'online' || !net.isOnline()) throw new Error('网络问题');
    return guardedFetch(url, init);
  }) as typeof fetch });
  const keyFile = path.join(platform.paths.buddyDir, 'data-key.bin');
  // A key file written before 11-16 (wrapped by the real keychain) cannot be opened under use-mock-keychain on Mac:
  // it is replaced and the old state set aside. Windows (DPAPI, no prompt) still unwraps it once
  const legacyUnwrap = sandbox ? undefined : (b: Buffer) => Buffer.from(safeStorage.decryptString(b), 'base64');
  const dataKey = loadDataKey(platform.fs, keyFile, legacyUnwrap);
  try { nfs.chmodSync(keyFile, 0o600); } catch { /* best effort */ }
  if (dataKey.replaced) {
    // Secrets saved with the unreadable old key: set the state aside instead of failing on it
    const stateFile = path.join(platform.paths.buddyDir, 'state.json');
    try { nfs.renameSync(stateFile, `${stateFile}.unreadable-${Date.now()}`); } catch { /* none */ }
  }
  const cipher = aesCipher(dataKey.key);
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
    fetchBytes: async (url, onProgress) => {
      // With progress it is an app download (forced upgrade, ~90 MB): allow a slow line half an hour
      const r = await guardedFetch(url, { signal: AbortSignal.timeout(onProgress ? 30 * 60_000 : 60_000) });
      if (!r.ok) throw new Error(String(r.status));
      return { type: r.headers.get('content-type') ?? 'image/png', data: await readBytes(r, onProgress) };
    },
    // M-12: DeepSeek tells gift credit from topped-up money (GET /user/balance); other vendors: unknown
    balance: async (p, key) => {
      if (p.id !== 'deepseek') return null;
      const r = await guardedFetch(`${p.baseUrl.replace(/\/v1\/?$/, '')}/user/balance`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const info = ((await r.json()) as { balance_infos?: { granted_balance?: string; topped_up_balance?: string }[] }).balance_infos?.[0];
      return info ? { granted: Number(info.granted_balance ?? 0), toppedUp: Number(info.topped_up_balance ?? 0) } : null;
    },
    remoteUrls: endpoints.remoteConfig, bundledRemote: bundled, version: app.getVersion(), os,
    // Test mode signs the fake config server's copy with the test key (test/fakes/remote-test-key.mjs)
    remotePublicKey: (testMode && process.env.CODEXBUDDY_REMOTE_KEY) || REMOTE_CONFIG_PUBLIC_KEY,
    now: () => Date.now(),
    emit: (event, payload) => sendEvent(win, event, payload),
    openExternal,
    clearBrowserData: () => session.fromPartition(BROWSER_PARTITION).clearStorageData(),
    connections: connectionViews,
    // sips / iconutil cannot read inside app.asar: hand them a copy in CodexBuddy's own folder
    logoPng: vendor => {
      const packed = path.join(__dirname, '..', 'ui', 'assets', 'logos', `${vendor}.png`);
      if (!packed.includes('app.asar')) return packed;
      const out = path.join(platform.paths.buddyDir, 'logos', `${vendor}.png`);
      if (!nfs.existsSync(out) && nfs.existsSync(packed)) { nfs.mkdirSync(path.dirname(out), { recursive: true }); nfs.writeFileSync(out, nfs.readFileSync(packed)); }
      return out;
    },
    runInstaller: async file => { if (sandbox) record('open', file); else { await open(file); if (os === 'win') app.quit(); } },
  });

  let started = false;
  network = new NetworkGate(
    () => checkInternet(guardedFetch as typeof fetch, testMode ? endpoints.remoteConfig.map(url => new URL('/network-check', url).href) : undefined),
    state => {
      sendEvent(win, 'network', state);
      if (state === 'offline') { rb.close(); services.handlers['switch:cancel']?.(); }
      if (state === 'online' && !started) { started = true; void services.startup().catch(() => undefined); }
    },
    () => net.isOnline(),
  );
  registerIpc({ ...services.handlers, ...browserHandlers(rb),
    'network:check': async () => ({ ok: await network.check() }),
    'network:offline': () => network.block(),
    'app:quit': () => app.quit(),
  }, channel => network.allows(channel));
  // A vendor added under 「其他厂商」 (M-19) is allowed once its base URL is in use
  installNetGuard(() => [...defaultAllowedHosts(providers), ...Object.values(endpoints.vendors).map(u => new URL(u!).host), ...Object.values(upstreams).map(u => new URL(u).host)],
    () => sendEvent(win, 'connections', connectionViews()));

  win = createMainWindow(os, { offscreen: testMode, devTools: allowDebug });
  win.on('closed', () => { win = null; });
  if (sandbox && !testMode && process.env.CODEXBUDDY_LOGIN_WINDOWS === '1') {
    const targets = loginWindowTargets(vendors);
    const status = targets.map(t => ({ vendor: t.vendor, name: t.name, url: t.url, loggedIn: false }));
    const statusFile = path.join(sandbox, 'login-status.json');
    const write = () => nfs.writeFileSync(statusFile, JSON.stringify({ at: new Date().toISOString(), status }, null, 2));
    openLoginWindows(targets, (i, url) => {
      status[i].url = url;
      status[i].loggedIn = vendors[targets[i].vendor].isLoggedIn(url);
      write();
    });
    write();
  }
  const poll = setInterval(() => { if (network.state === 'online') services.pollModel(); }, 2000);
  const heartbeat = setInterval(() => { if (network.state === 'online') void network.check(); }, NETWORK_POLL_MS);
  app.on('before-quit', () => { clearInterval(poll); clearInterval(heartbeat); void bridge.close(); });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(main).catch(e => { console.error(String(e)); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
