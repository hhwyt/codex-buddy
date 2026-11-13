// Update check (T-02, U-01..U-03). Owner: A1.
import { todo } from './todo';

/** -1 / 0 / 1 like a comparator; tolerates a leading v and missing parts */
export function compareVersions(_a: string, _b: string): number {
  return todo('A1', 'compareVersions');
}

export type UpdateCheck = { kind: 'new'; version: string; notes: string } | { kind: 'latest' } | { kind: 'offline' };

/** U-01: the same version is not offered again within a day after「稍后」 */
export function shouldPrompt(_version: string, _lastDismissed: { version: string; at: number } | null, _now: number): boolean {
  return todo('A1', 'shouldPrompt');
}
