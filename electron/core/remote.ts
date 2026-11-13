// remote/config.json: read jsDelivr → GitHub → last good copy → bundled fallback. Owner: A1.
// Never contains or calls any non-GitHub host (H-03). U-04: switches hide a vendor card or the 汉化 entry.
import { todo } from './todo';
import type { RemoteConfig } from './types';

export type Fetcher = (url: string, timeoutMs: number) => Promise<string>;

export function validateRemote(_text: string): RemoteConfig | null {
  return todo('A1', 'validateRemote');
}

export async function loadRemote(_urls: string[], _fetch: Fetcher, _lastGood: RemoteConfig | null, _bundled: RemoteConfig): Promise<{ config: RemoteConfig; source: 'jsdelivr' | 'github' | 'cache' | 'bundled' }> {
  return todo('A1', 'loadRemote');
}
