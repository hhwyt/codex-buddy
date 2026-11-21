import type { Channel, NetworkState } from './ipc-contract';
import { NETWORK_READ_CHANNELS } from './ipc-contract';

export const NETWORK_PROBE_URLS = [
  'https://storeedgefd.dsx.mp.microsoft.com/v9.0/information',
  'https://open.bigmodel.cn/',
];
export const NETWORK_TIMEOUT_MS = 5000;

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

const UNBLOCKED = new Set<Channel>(['network:check', 'app:quit', 'browser:close', 'switch:cancel']);
const READ_ONLY = new Set<Channel>(NETWORK_READ_CHANNELS);

/** The check made each time CodexBuddy opens (N-01..N-04). Until it passes, actions wait for it or are refused; reads
 * always go through (the window shows the usual page from the start). Once it has passed, losing the network later in
 * the session never locks anything: each operation that needs the network reports its own failure. */
export class NetworkGate {
  private current: NetworkState = 'checking';
  private pending: Promise<boolean> | null = null;

  constructor(
    private readonly verify: () => Promise<boolean>,
    private readonly changed: (state: NetworkState) => void,
    private readonly systemOnline: () => boolean = () => true,
  ) {}

  get state(): NetworkState { return this.current; }

  check(): Promise<boolean> {
    if (this.current === 'online') return Promise.resolve(true);
    if (this.pending) return this.pending;
    const pending = Promise.resolve().then(async () => this.systemOnline() && await this.verify()).catch(() => false).then(ok => {
      this.setState(ok ? 'online' : 'offline');
      return ok;
    }).finally(() => { if (this.pending === pending) this.pending = null; });
    this.pending = pending;
    return pending;
  }

  async allows(channel: Channel): Promise<boolean> {
    if (UNBLOCKED.has(channel) || READ_ONLY.has(channel) || this.current === 'online') return true;
    // An action clicked before the opening check finished waits for it
    return this.current === 'checking' && this.check();
  }

  private setState(state: NetworkState): void {
    if (this.current === state) return;
    this.current = state;
    this.changed(state);
  }
}
