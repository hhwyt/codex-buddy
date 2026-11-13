// Update check (T-02, U-01..U-03). Owner: A1.
import type { RemoteConfig } from './types';

const parts = (v: string): number[] => v.trim().replace(/^v/i, '').split(/[.-]/).map(x => parseInt(x, 10) || 0);

/** -1 / 0 / 1 like a comparator; tolerates a leading v and missing parts */
export function compareVersions(a: string, b: string): number {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export type UpdateCheck = { kind: 'new'; version: string; notes: string } | { kind: 'latest' } | { kind: 'offline' };

export const DAY_MS = 24 * 60 * 60 * 1000;

/** T-02: what the remote config says about the running version; null config = we could not reach it */
export function checkUpdate(current: string, remote: RemoteConfig | null): UpdateCheck {
  if (!remote) return { kind: 'offline' };
  const { version, notes } = remote.latest;
  return compareVersions(version, current) > 0 ? { kind: 'new', version, notes } : { kind: 'latest' };
}

/** U-01: the same version is not offered again within a day after「稍后」 */
export function shouldPrompt(version: string, lastDismissed: { version: string; at: number } | null, now: number): boolean {
  if (!lastDismissed || lastDismissed.version !== version) return true;
  return now - lastDismissed.at >= DAY_MS;
}
