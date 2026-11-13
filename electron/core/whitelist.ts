// CodexBuddy's own network whitelist + connection log (S-04, S-05). Owner: A1 (logic), A4 (main/net.ts enforces).
// The right-side browser is NOT filtered (official pages would break); it is only logged, in its own list.
import { todo } from './todo';

export const BASE_HOSTS = ['github.com', 'objects.githubusercontent.com', 'raw.githubusercontent.com', 'cdn.jsdelivr.net'];

export interface ConnectionRecord {
  host: string;
  source: 'app' | 'browser';
  allowed: boolean;
  at: number;
}

export function isAllowed(_host: string, _allowed: string[]): boolean {
  return todo('A1', 'isAllowed');
}
