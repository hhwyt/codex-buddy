// External addresses, overridable for tests. Owner: Base (frozen), A7 uses it in e2e.
// CODEXBUDDY_ENDPOINTS (JSON) points every external address at fake servers:
//   { "remoteConfig": ["http://127.0.0.1:1234/cfg.json"], "vendors": { "deepseek": "http://127.0.0.1:5678/deepseek" } }
// A vendor override replaces the origin of every URL of that vendor (API, login, keys, recharge pages) with
// <override> + the original path's role: /v1, /login, /keys, /recharge (see test/fakes/vendor-server.mjs).
import type { BuiltinVendorId, ProviderInfo } from './types';

export const REMOTE_CONFIG_URLS = [
  'https://hhwyt.xyz/codex-buddy-releases/remote/config.json',
  'https://hhwyt.github.io/codex-buddy-releases/remote/config.json',
  'https://cdn.jsdelivr.net/gh/hhwyt/codex-buddy-releases@main/remote/config.json',
  'https://raw.githubusercontent.com/hhwyt/codex-buddy-releases/main/remote/config.json',
];

export interface Endpoints {
  remoteConfig: string[];
  vendors: Partial<Record<BuiltinVendorId, string>>;
}

export function parseEndpoints(env: string | undefined): Endpoints {
  const base: Endpoints = { remoteConfig: REMOTE_CONFIG_URLS, vendors: {} };
  if (!env) return base;
  try {
    const parsed = JSON.parse(env);
    return {
      remoteConfig: Array.isArray(parsed.remoteConfig) ? parsed.remoteConfig.map(String) : base.remoteConfig,
      vendors: typeof parsed.vendors === 'object' && parsed.vendors ? parsed.vendors : {},
    };
  } catch {
    return base;
  }
}

/** The provider with its URLs pointed at the fake server when endpoints say so */
export function withEndpoints(p: ProviderInfo, e: Endpoints): ProviderInfo {
  const o = e.vendors[p.id];
  if (!o) return p;
  return {
    ...p, baseUrl: `${o}/v1`, loginUrl: `${o}/login`, keysUrl: `${o}/keys`,
    rechargeUrl: p.rechargeUrl ? `${o}/recharge` : null, hosts: [new URL(o).host],
  };
}
