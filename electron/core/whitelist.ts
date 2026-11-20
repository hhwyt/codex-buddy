// CodexBuddy's own network whitelist + connection log (S-04, S-05). Owner: A1 (logic), A4 (main/net.ts enforces).
// The right-side browser is NOT filtered (official pages would break); it is only logged, in its own list.
import type { ProviderInfo } from './types';

export const BASE_HOSTS = ['hhwyt.xyz', 'hhwyt.github.io', 'github.com', 'objects.githubusercontent.com', 'raw.githubusercontent.com', 'cdn.jsdelivr.net', 'storeedgefd.dsx.mp.microsoft.com'];

export interface ConnectionRecord {
  host: string;
  source: 'app' | 'browser';
  allowed: boolean;
  at: number;
}

const LOCAL = ['127.0.0.1', 'localhost', '::1', '[::1]'];

/** host (no port) is on the list exactly, or is a subdomain of a listed host; 127.0.0.1 (bridge, fakes) always */
export function isAllowed(host: string, allowed: string[]): boolean {
  const h = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (!h) return false;
  if (LOCAL.includes(h)) return true;
  return allowed.some(a => {
    const x = a.toLowerCase();
    return h === x || h.endsWith(`.${x}`);
  });
}

/** Hosts CodexBuddy may reach: GitHub / jsDelivr plus every vendor's hosts */
export function allowedHosts(providers: ProviderInfo[]): string[] {
  return [...new Set([...BASE_HOSTS, ...providers.flatMap(p => p.hosts)])];
}

/** host of a URL, '' when it is not one */
export function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

/** Connection log kept in memory: one record per host and source (latest time wins), newest first, capped */
export class ConnectionLog {
  private records = new Map<string, ConnectionRecord>();
  constructor(private readonly max = 500) {}

  /** Records a request; returns whether it may go out (browser requests always may, S-04) */
  record(host: string, source: ConnectionRecord['source'], allowed: string[], at: number): boolean {
    const ok = source === 'browser' || isAllowed(host, allowed);
    const key = `${source}|${host}`;
    this.records.delete(key);
    this.records.set(key, { host, source, allowed: ok, at });
    if (this.records.size > this.max) this.records.delete(this.records.keys().next().value!);
    return ok;
  }

  list(source: ConnectionRecord['source']): ConnectionRecord[] {
    return [...this.records.values()].filter(r => r.source === source).reverse();
  }
}
