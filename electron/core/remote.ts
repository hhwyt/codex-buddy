// remote/config.json: read jsDelivr → GitHub → last good copy → bundled fallback. Owner: A1.
// Never contains or calls any non-GitHub host (H-03). U-04: switches hide a vendor card or the 汉化 entry.
import { VENDOR_IDS, type ModelEntry, type RemoteConfig } from './types';

export type Fetcher = (url: string, timeoutMs: number) => Promise<string>;

export const REMOTE_TIMEOUT_MS = 8000;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): x is string => typeof x === 'string';

/** Hosts a URL inside the remote config may point at (H-03: GitHub and jsDelivr only) */
export const REMOTE_URL_HOSTS = ['github.com', 'objects.githubusercontent.com', 'raw.githubusercontent.com', 'cdn.jsdelivr.net'];

/** '' (not set) or an https URL on a GitHub / jsDelivr host */
export function isSafeUrl(url: string): boolean {
  if (url === '') return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && REMOTE_URL_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

function validModel(m: unknown): m is ModelEntry {
  return isObj(m) && str(m.slug) && !!m.slug && str(m.name) && typeof m.free === 'boolean'
    && (m.reasoning === undefined || (Array.isArray(m.reasoning) && m.reasoning.every(str)));
}

/** Parsed config, or null when anything required is missing or the wrong shape (a broken file is never used) */
export function validateRemote(text: string): RemoteConfig | null {
  let d: unknown;
  try { d = JSON.parse(text); } catch { return null; }
  if (!isObj(d) || d.schema !== 1) return null;
  const { latest, models, community, switches } = d;
  if (!isObj(latest) || ![latest.version, latest.notes, latest.macUrl, latest.winUrl].every(str)) return null;
  if (!isObj(models) || !isObj(community) || !str(community.qrUrl) || !str(community.text)) return null;
  if (![latest.macUrl, latest.winUrl, community.qrUrl].every(u => isSafeUrl(u as string))) return null;
  if (!isObj(switches) || !Array.isArray(switches.hiddenVendors) || !switches.hiddenVendors.every(str)) return null;
  if (typeof switches.hideZh !== 'boolean' || typeof switches.hideClone !== 'boolean') return null;
  const out: RemoteConfig['models'] = {};
  for (const [id, list] of Object.entries(models)) {
    if (!(VENDOR_IDS as readonly string[]).includes(id)) continue;
    if (!Array.isArray(list) || !list.every(validModel)) return null;
    out[id as keyof RemoteConfig['models']] = list.map(m => ({ slug: m.slug, name: m.name, free: m.free, reasoning: m.reasoning ?? [] }));
  }
  return {
    schema: 1,
    latest: { version: latest.version as string, notes: latest.notes as string, macUrl: latest.macUrl as string, winUrl: latest.winUrl as string },
    models: out,
    community: { qrUrl: community.qrUrl, text: community.text },
    switches: { hiddenVendors: [...switches.hiddenVendors], hideZh: switches.hideZh, hideClone: switches.hideClone },
  };
}

/** urls[0] is jsDelivr, urls[1] GitHub (core/endpoints.ts). The first valid answer wins */
export async function loadRemote(urls: string[], fetch: Fetcher, lastGood: RemoteConfig | null, bundled: RemoteConfig): Promise<{ config: RemoteConfig; source: 'jsdelivr' | 'github' | 'cache' | 'bundled' }> {
  for (let i = 0; i < urls.length; i++) {
    try {
      const config = validateRemote(await fetch(urls[i], REMOTE_TIMEOUT_MS));
      if (config) return { config, source: i === 0 ? 'jsdelivr' : 'github' };
    } catch { /* next one */ }
  }
  return lastGood ? { config: lastGood, source: 'cache' } : { config: bundled, source: 'bundled' };
}

/** U-04: vendors the remote switch hides (OpenAI official account can be hidden too) */
export const isHidden = (vendor: string, config: RemoteConfig): boolean => config.switches.hiddenVendors.includes(vendor);
