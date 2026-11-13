// All vendors by id, in card order, plus the test / fake-server variant and the batch login list. Owner: A4.
import { withEndpoints, type Endpoints } from '../core/endpoints';
import { PROVIDERS } from '../core/providers';
import type { BuiltinVendorId } from '../core/types';
import { makeVendor } from './base';
import { deepseek } from './deepseek';
import { hunyuan } from './hunyuan';
import { kimi } from './kimi';
import { minimax } from './minimax';
import { openai } from './openai';
import { qwen } from './qwen';
import type { Vendor } from './types';
import { zhipu } from './zhipu';

export const VENDORS: Record<BuiltinVendorId, Vendor> = { deepseek, zhipu, kimi, qwen, minimax, hunyuan, openai };

/** VENDORS with CODEXBUDDY_ENDPOINTS applied: an overridden vendor talks to the fake server, whose console API
 * POST <override>/api/keys creates the key (test/fakes/vendor-server.mjs) */
export function vendorsWith(e: Endpoints): Record<BuiltinVendorId, Vendor> {
  const out = { ...VENDORS };
  for (const p of PROVIDERS) {
    const o = e.vendors[p.id];
    if (o) out[p.id] = makeVendor(withEndpoints(p, e), { createKeyUrl: p.officialAccount ? undefined : `${o}/api/keys` });
  }
  return out;
}

/** The six in-app login windows: vendor, card name and login page */
export function loginWindowTargets(vendors: Record<BuiltinVendorId, Vendor>): { vendor: BuiltinVendorId; name: string; url: string }[] {
  return Object.values(vendors).filter(v => !v.provider.officialAccount).map(v => ({ vendor: v.id, name: v.provider.name, url: v.provider.loginUrl }));
}

/** 「一次性打开 7 家登录页」: six open in CodexBuddy's own browser partition, OpenAI in the system browser */
export function batchLoginTargets(vendors: Record<BuiltinVendorId, Vendor>): { inApp: string[]; external: string[] } {
  const all = Object.values(vendors).map(v => v.provider);
  return {
    inApp: all.filter(p => !p.officialAccount).map(p => p.loginUrl),
    external: all.filter(p => p.officialAccount).map(p => p.loginUrl),
  };
}
