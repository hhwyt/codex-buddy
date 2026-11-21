// CodexBuddy's side of the standalone bridge service (main/bridge-daemon.ts), D-01..D-05:
//   ensureBridge   at start: use the running service of this version, else stop an old one and start a new one
//   registerUpstream  what config.toml's base_url for a chat-only vendor points at (written for the service to read)
//   autostart      start it at login: Mac LaunchAgent plist, Windows HKCU Run value (never in a sandbox)
//   removeBridge   一键还原: no login item, no service, no files left
// Electron-free: app.ts passes the spawn / kill / command pieces in.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { bridgeStateFile, bridgeUpstreamsFile, probeBridge, readJson, type BridgeHealth, type BridgeState } from './bridge-daemon';

/** Command-line switch: start the bridge service and quit (what the Windows login item runs) */
export const BRIDGE_FLAG = '--codexbuddy-bridge';
export const LAUNCH_AGENT_LABEL = 'app.codexbuddy.bridge';
export const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
export const RUN_VALUE = 'CodexBuddyBridge';
/** How long CodexBuddy waits for a freshly started service to answer */
export const BRIDGE_START_MS = 8000;

export interface BridgeServiceDeps {
  buddyDir: string;
  version: string;
  /** Starts bridge-daemon.js detached, through --run-script of CodexBuddy's own program */
  spawn(): void;
  kill(pid: number): void;
  probe?(port: number): Promise<BridgeHealth | null>;
  sleep?(ms: number): Promise<void>;
  startMs?: number;
}

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** The running service's address (http://127.0.0.1:<port>); starts or replaces it when needed */
export async function ensureBridge(d: BridgeServiceDeps): Promise<string> {
  const probe = d.probe ?? probeBridge;
  const sleep = d.sleep ?? wait;
  const stateFile = bridgeStateFile(d.buddyDir);
  const before = readJson<BridgeState>(stateFile);
  if (before?.port) {
    const h = await probe(before.port);
    if (h?.version === d.version) return `http://127.0.0.1:${before.port}`;
    // An older CodexBuddy's service (after an upgrade): replace it, on the same port
    if (h) {
      d.kill(h.pid);
      for (let i = 0; i < 20 && (await probe(before.port)); i++) await sleep(100);
    }
  }
  d.spawn();
  const deadline = (d.startMs ?? BRIDGE_START_MS) / 100;
  for (let i = 0; i < deadline; i++) {
    await sleep(100);
    const s = readJson<BridgeState>(stateFile);
    if (s?.port && (await probe(s.port))?.version === d.version) return `http://127.0.0.1:${s.port}`;
  }
  throw new Error('转发服务没有启动');
}

export function registerUpstream(buddyDir: string, vendor: string, upstream: string): void {
  const file = bridgeUpstreamsFile(buddyDir);
  const all = readJson<Record<string, string>>(file) ?? {};
  if (all[vendor] === upstream) return;
  fs.mkdirSync(buddyDir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ ...all, [vendor]: upstream }, null, 2)}\n`);
}

/** How the login item starts the service */
export interface LaunchSpec {
  /** CodexBuddy's program (process.execPath) */
  exe: string;
  /** Not packaged (npm start): the app folder Electron needs in front of the switch */
  appPath: string | null;
  /** dist/main/bridge-daemon.js */
  daemon: string;
  buddyDir: string;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const launchAgentFile = (home: string) => path.join(home, 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`);

/** ~/Library/LaunchAgents plist: launchd loads it at every login and runs the service through --run-script */
export function launchAgentPlist(s: LaunchSpec): string {
  const args = [s.exe, ...(s.appPath ? [s.appPath] : []), '--run-script', s.daemon, '--buddy-dir', s.buddyDir];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key><string>${LAUNCH_AGENT_LABEL}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...args.map(a => `    <string>${xml(a)}</string>`),
    '  </array>',
    '  <key>RunAtLoad</key><true/>',
    '  <key>ProcessType</key><string>Background</string>',
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

/** The Windows Run value: CodexBuddy with BRIDGE_FLAG, which starts the service through --run-script and quits */
export function runValue(s: LaunchSpec): string {
  return [s.exe, ...(s.appPath ? [s.appPath] : [])].map(a => `"${a}"`).concat(BRIDGE_FLAG).join(' ');
}

export interface Autostart { install(): Promise<void>; remove(): Promise<void> }

export function macAutostart(home: string, spec: LaunchSpec): Autostart {
  const file = launchAgentFile(home);
  return {
    async install() {
      const text = launchAgentPlist(spec);
      if (readText(file) === text) return;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    },
    async remove() { fs.rmSync(file, { force: true }); },
  };
}

export function winAutostart(run: (cmd: string, args: string[]) => Promise<string>, spec: LaunchSpec): Autostart {
  return {
    install: async () => { await run('reg.exe', ['add', RUN_KEY, '/v', RUN_VALUE, '/t', 'REG_SZ', '/d', runValue(spec), '/f']); },
    remove: async () => { await run('reg.exe', ['delete', RUN_KEY, '/v', RUN_VALUE, '/f']).catch(() => ''); },
  };
}

/** Sandboxes and tests never touch the real login items */
export const noAutostart: Autostart = { install: async () => {}, remove: async () => {} };

/** Stops the running service (Windows, before an update: the installer cannot replace CodexBuddy.exe while it runs) */
export async function stopBridge(d: { buddyDir: string; kill(pid: number): void; probe?(port: number): Promise<BridgeHealth | null> }): Promise<void> {
  const s = readJson<BridgeState>(bridgeStateFile(d.buddyDir));
  const h = s?.port ? await (d.probe ?? probeBridge)(s.port) : null;
  if (h) d.kill(h.pid);
}

/** 一键还原: remove the login item, stop the service, drop its files */
export async function removeBridge(d: { buddyDir: string; autostart: Autostart; kill(pid: number): void; probe?(port: number): Promise<BridgeHealth | null> }): Promise<void> {
  await d.autostart.remove();
  await stopBridge(d);
  for (const f of [bridgeStateFile(d.buddyDir), bridgeUpstreamsFile(d.buddyDir)]) fs.rmSync(f, { force: true });
}

function readText(file: string): string | null {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}
