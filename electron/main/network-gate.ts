import type { Channel, NetworkState } from './ipc-contract';
import { NETWORK_READ_CHANNELS } from './ipc-contract';

export const NETWORK_PROBE_URLS = [
  'https://storeedgefd.dsx.mp.microsoft.com/v9.0/information',
  'https://open.bigmodel.cn/',
];
export const NETWORK_TIMEOUT_MS = 5000;
export const NETWORK_POLL_MS = 15_000;

/** A new HTTPS response is required. No persisted state, browser cache or OS online flag can grant access. */
export async function checkInternet(doFetch: typeof fetch, urls = NETWORK_PROBE_URLS): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await Promise.any(urls.map(async url => {
      const response = await doFetch(url, { cache: 'no-store', redirect: 'error', signal: controller.signal });
      const valid = response.status === 200 && (!response.url || new URL(response.url).origin === new URL(url).origin);
      await response.body?.cancel();
      if (!valid) throw new Error('network probe failed');
      return true;
    })).catch(() => false);
  } finally { clearTimeout(timeout); controller.abort(); }
}

const UNBLOCKED = new Set<Channel>(['network:check', 'network:offline', 'app:quit', 'browser:close', 'switch:cancel']);
const READ_ONLY = new Set<Channel>(NETWORK_READ_CHANNELS);

export class NetworkGate {
  private current: NetworkState = 'checking';
  private pending: Promise<boolean> | null = null;
  private generation = 0;

  constructor(
    private readonly verify: () => Promise<boolean>,
    private readonly changed: (state: NetworkState) => void,
    private readonly systemOnline: () => boolean = () => true,
  ) {}

  get state(): NetworkState { return this.current; }

  block(): void {
    this.generation++;
    this.pending = null;
    this.setState('offline');
  }

  check(): Promise<boolean> {
    if (this.pending) return this.pending;
    const generation = this.generation;
    const pending = Promise.resolve().then(async () => this.systemOnline() && await this.verify()).catch(() => false).then(ok => {
      if (generation !== this.generation) return false;
      this.setState(ok ? 'online' : 'offline');
      return ok;
    }).finally(() => { if (this.pending === pending) this.pending = null; });
    this.pending = pending;
    return pending;
  }

  async allows(channel: Channel): Promise<boolean> {
    if (UNBLOCKED.has(channel)) return true;
    if (this.current !== 'online') return false;
    if (!this.systemOnline()) { this.block(); return false; }
    // Reads use the active session; actions must pass another live probe before doing any work.
    return READ_ONLY.has(channel) || this.check();
  }

  private setState(state: NetworkState): void {
    if (this.current === state) return;
    this.current = state;
    this.changed(state);
  }
}
