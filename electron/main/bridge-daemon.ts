// The standalone bridge service (D-01..D-04): the Responses → Chat Completions bridge (bridge-server.ts) in a process of
// its own, so Codex keeps talking to DeepSeek, Kimi… after CodexBuddy is closed. It is CodexBuddy's own program run with
// --run-script (no window, no Dock or taskbar icon; the runAsNode fuse is off), started by CodexBuddy and at login
// (main/bridge-service.ts). Node APIs only.
//   <buddyDir>/bridge.json            { port, pid, version } of the running service
//   <buddyDir>/bridge-upstreams.json  vendor id → that vendor's Chat Completions base URL, written by CodexBuddy and read
//                                     on every request
// The port stays the same across restarts: the one it had last time, else BRIDGE_PORT; only when that is taken by
// another program does it take a free one (and keeps that from then on). It quits when <buddyDir> is gone.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HEALTH_PATH, startBridge } from './bridge-server';

export const BRIDGE_PORT = 48721;
export const BRIDGE_NAME = 'codexbuddy-bridge';
export const bridgeStateFile = (buddyDir: string) => path.join(buddyDir, 'bridge.json');
export const bridgeUpstreamsFile = (buddyDir: string) => path.join(buddyDir, 'bridge-upstreams.json');
/** How often the service checks that <buddyDir> still exists */
export const GONE_CHECK_MS = 5000;

export interface BridgeState { port: number; pid: number; version: string }
export interface BridgeHealth { name: typeof BRIDGE_NAME; version: string; pid: number }

export function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return null; }
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
/** Only https upstreams, or plain http on this machine (the test fakes); anything else in the file is ignored */
export function upstreamAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && LOOPBACK.has(u.hostname));
  } catch { return false; }
}

export function readUpstreams(buddyDir: string): Record<string, string> {
  const raw = readJson<Record<string, unknown>>(bridgeUpstreamsFile(buddyDir)) ?? {};
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string' && upstreamAllowed(e[1])));
}

/** The service's answer on this port, or null when nothing (or something else) listens there */
export async function probeBridge(port: number, timeoutMs = 1500): Promise<BridgeHealth | null> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}${HEALTH_PATH}`, { signal: AbortSignal.timeout(timeoutMs) });
    const body = (await r.json()) as Partial<BridgeHealth>;
    return body?.name === BRIDGE_NAME && typeof body.version === 'string' && typeof body.pid === 'number' ? body as BridgeHealth : null;
  } catch { return null; }
}

export interface DaemonOptions {
  buddyDir: string;
  version: string;
  /** First port to try when bridge.json has none (default BRIDGE_PORT; 0 = any, for tests) */
  port?: number;
  fetch?: typeof fetch;
  /** Called once <buddyDir> has gone and the service closed */
  onGone?: () => void;
  goneCheckMs?: number;
}

export interface RunningBridge { url: string; port: number; close(): Promise<void> }

/** Starts the service, or returns null when the same version already runs on the recorded port */
export async function runBridgeDaemon(o: DaemonOptions): Promise<RunningBridge | null> {
  const stateFile = bridgeStateFile(o.buddyDir);
  const saved = readJson<BridgeState>(stateFile);
  if (saved?.port && (await probeBridge(saved.port))?.version === o.version) return null;
  const candidates = [...new Set([saved?.port, o.port ?? BRIDGE_PORT, 0].filter((p): p is number => typeof p === 'number'))];
  const health = (): BridgeHealth => ({ name: BRIDGE_NAME, version: o.version, pid: process.pid });
  let server: Awaited<ReturnType<typeof startBridge>> | null = null;
  for (const port of candidates) {
    try {
      server = await startBridge(() => readUpstreams(o.buddyDir), { port, health, ...(o.fetch ? { fetch: o.fetch } : {}) });
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
    }
  }
  if (!server) throw new Error('no port');
  const running = server;
  const port = Number(new URL(running.url).port);
  fs.mkdirSync(o.buddyDir, { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify({ port, pid: process.pid, version: o.version } satisfies BridgeState)}\n`);
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(watch);
    await running.close();
  };
  const watch = setInterval(() => {
    if (!fs.existsSync(o.buddyDir)) void close().then(() => o.onGone?.());
  }, o.goneCheckMs ?? GONE_CHECK_MS);
  watch.unref();
  return { url: running.url, port, close };
}

/** Entry: CodexBuddy --run-script bridge-daemon.js --buddy-dir <dir> [--port <n>] */
export function main(argv: string[]): void {
  const arg = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const buddyDir = arg('--buddy-dir');
  if (!buddyDir) process.exit(2);
  const port = arg('--port');
  const version = readJson<{ version?: string }>(path.join(__dirname, '..', '..', 'package.json'))?.version ?? '0.0.0';
  runBridgeDaemon({ buddyDir, version, ...(port !== undefined ? { port: Number(port) } : {}), onGone: () => process.exit(0) }).then(bridge => {
    if (!bridge) process.exit(0);
    const quit = () => { void bridge.close().finally(() => process.exit(0)); };
    process.on('SIGTERM', quit);
    process.on('SIGINT', quit);
  }, () => process.exit(1));
}

// Packaged and at login it runs as `CodexBuddy --run-script <this file> …`: app.ts has already loaded this module for
// its constants, so it calls main() itself. Run directly with node (tests), this line starts it.
if (require.main === module) main(process.argv.slice(2));
