// CodexBuddy's own network: whitelist enforcement on the default session + connection log (S-04, S-05). Owner: A4.
// Requests from the app (window, guardedFetch for remote config and vendor APIs) outside the whitelist are cancelled
// and logged as「CodexBuddy 连过的」; the right-side browser's partition is never filtered (official pages would break),
// only logged as「网页里连过的」. Loopback is always allowed (the bridge and test fakes run there).
import { session, type Session } from 'electron';
import { BASE_HOSTS, type ConnectionRecord } from '../core/whitelist';
import type { ProviderInfo } from '../core/types';
import { BROWSER_PARTITION } from './browser';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const NETWORK_SCHEME = /^(https?|wss?):$/;

/** Whitelist: the base hosts (GitHub, jsDelivr) plus every vendor host */
export function defaultAllowedHosts(providers: ProviderInfo[]): string[] {
  return [...new Set([...BASE_HOSTS, ...providers.flatMap(p => p.hosts)])];
}

/** host may carry a port; allowed = loopback, an exact whitelist entry, or a subdomain of one */
export function hostAllowed(host: string, allowed: string[]): boolean {
  const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  if (LOOPBACK.has(name)) return true;
  return allowed.some(a => {
    const bare = a.split(':')[0];
    return a === host || bare === name || name.endsWith(`.${bare}`);
  });
}

type Source = ConnectionRecord['source'];
const log: Record<Source, Map<string, ConnectionRecord>> = { app: new Map(), browser: new Map() };
let allowedHosts: () => string[] = () => [...BASE_HOSTS];
let onRecord: (r: ConnectionRecord) => void = () => {};

/** Logs one request; onRecord fires only for a host not seen before in that list (or whose verdict changed) */
export function record(source: Source, host: string, allowed: boolean): ConnectionRecord {
  const prev = log[source].get(host);
  const r: ConnectionRecord = { host, source, allowed, at: Date.now() };
  log[source].set(host, r);
  if (!prev || prev.allowed !== allowed) onRecord(r);
  return r;
}

/** The two lists for the security panel (S-04), newest first */
export function connections(): { app: ConnectionRecord[]; web: ConnectionRecord[] } {
  const sorted = (m: Map<string, ConnectionRecord>) => [...m.values()].sort((a, b) => b.at - a.at);
  return { app: sorted(log.app), web: sorted(log.browser) };
}

export function resetConnections(): void {
  log.app.clear();
  log.browser.clear();
}

/** Verdict for one request URL from a given source; non-network schemes (file:, devtools:, data:) pass unlogged */
export function checkRequest(source: Source, url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return true; }
  if (!NETWORK_SCHEME.test(u.protocol)) return true;
  if (source === 'browser') { record('browser', u.host, true); return true; }
  const ok = hostAllowed(u.host, allowedHosts());
  record('app', u.host, ok);
  return ok;
}

export function installNetGuard(
  allowed: () => string[],
  recordCb: (r: ConnectionRecord) => void,
  sessions: { app: Session; browser: Session } = { app: session.defaultSession, browser: session.fromPartition(BROWSER_PARTITION) },
): void {
  allowedHosts = allowed;
  onRecord = recordCb;
  sessions.app.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !checkRequest('app', details.url) }));
  sessions.browser.webRequest.onBeforeRequest((details, cb) => { checkRequest('browser', details.url); cb({}); });
}

/** fetch for the main process that goes through the whitelist (remote config, vendor console APIs) */
export async function guardedFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!checkRequest('app', url)) throw new Error(`不在白名单里，没有连 ${new URL(url).host}`);
  return fetch(url, init);
}
