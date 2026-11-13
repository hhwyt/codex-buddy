// CodexBuddy's own network: whitelist enforcement on the default session + connection log (S-04, S-05).
// Owner: A4 (logic in core/whitelist.ts, A1). Requests from the app (key creation, 测试连通 is Codex's own, remote
// config) outside the whitelist are cancelled and logged; the right-side browser's partition is only logged.
import { todo } from '../core/todo';
import type { ConnectionRecord } from '../core/whitelist';

export function installNetGuard(_allowedHosts: () => string[], _onRecord: (r: ConnectionRecord) => void): void {
  todo('A4', 'installNetGuard');
}

/** fetch for the main process that goes through the whitelist (remote config, vendor console APIs) */
export async function guardedFetch(_url: string, _init?: RequestInit): Promise<Response> {
  return todo('A4', 'guardedFetch');
}
