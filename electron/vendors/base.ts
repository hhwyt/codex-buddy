// Shared vendor behaviour: login detection, the 3-level key ladder, recharge and key pages. Owner: A4.
// Ladder (build-plan §2): 1) console API creates a key named CodexBuddy with the page's own cookies; 2) the user clicks
// 「创建」on the official key page and the key is caught from the page's network response; 3) need-paste (the hidden
// 「粘贴 Key」fallback). Never clicks a pay button (M-18): the recharge page is only opened.
import type { ProviderInfo } from '../core/types';
import type { BrowserDriver, KeyOutcome, Vendor } from './types';

export const KEY_NAME = 'CodexBuddy';

export interface VendorDetails {
  /** URL test for a logged-in console page; default: on a console host and not on a login path */
  loggedIn?: (url: string) => boolean;
  /** Level 1: console API (same origin as the console page) that creates a key; none = start at level 2 */
  createKeyUrl?: string;
  /** Level 2: response URL pattern that may carry a freshly created key; default: key-ish paths on console hosts */
  keyResponse?: RegExp;
  /** How long to wait for the user (login scan, clicking「创建」) */
  timeouts?: { loginMs: number; createMs: number; settleMs?: number };
}

const DEFAULT_TIMEOUTS = { loginMs: 10 * 60_000, createMs: 5 * 60_000, settleMs: 1500 };
const LOGIN_PATH = /login|sign[_-]?(in|up)|signin|passport|register/i;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Hosts of the vendor's web console: the key and recharge pages' hosts, plus any other platform.* host the console
 *  redirects to (platform.moonshot.cn → platform.kimi.com, platform.minimaxi.com → platform.minimax.cn). Never the API
 *  host, and never sign-in hosts such as auth.openai.com. */
export function consoleHosts(p: ProviderInfo): string[] {
  const pages = [p.keysUrl, p.rechargeUrl].filter((u): u is string => !!u).map(u => new URL(u).host);
  return [...new Set([...pages, ...p.hosts.filter(h => h.startsWith('platform.'))])];
}

export function defaultLoggedIn(p: ProviderInfo): (url: string) => boolean {
  const hosts = consoleHosts(p);
  return url => {
    try {
      const u = new URL(url);
      return hosts.includes(u.host) && !LOGIN_PATH.test(u.pathname);
    } catch {
      return false;
    }
  };
}

export function defaultKeyResponse(p: ProviderInfo): RegExp {
  return new RegExp(`^https?://(${consoleHosts(p).map(escapeRe).join('|')})/.*(api[-_]?keys?|apikey|keys?|token)`, 'i');
}

const KEYISH_FIELD = /key|secret/i;
const TOKEN_FIELD = /token/i;
const KEYISH_VALUE = /^[A-Za-z0-9._-]{20,}$/;
const SK = /\bsk-[A-Za-z0-9._-]{16,}/;
const SK_WHOLE = /^sk-[A-Za-z0-9._-]{16,}$/;

/** Finds an unmasked key in a response body. An sk-… value wins wherever it is (Kimi answers createApiKey with
 *  { key: "ak-…" (the key's id), auth: "sk-…" (the key) }); then a field named like key / secret (智谱, MiniMax keys
 *  have no sk- prefix); a field named token only as the last resort */
export function extractKey(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return SK.exec(body)?.[0] ?? null;
  }
  const fields: [string, string][] = [];
  const stack: unknown[] = [parsed];
  while (stack.length) {
    const v = stack.pop();
    if (Array.isArray(v)) stack.push(...v);
    else if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'string') fields.push([k, val]);
        else if (val && typeof val === 'object') stack.push(val);
      }
    }
  }
  return fields.find(([, val]) => SK_WHOLE.test(val))?.[1]
    ?? fields.find(([k, val]) => KEYISH_FIELD.test(k) && KEYISH_VALUE.test(val))?.[1]
    ?? fields.find(([k, val]) => TOKEN_FIELD.test(k) && KEYISH_VALUE.test(val))?.[1]
    ?? null;
}

/** Script run in the console page: same-origin POST with the page's cookies; returns status and body */
export function createKeyScript(url: string): string {
  return `(async () => { const r = await fetch(${JSON.stringify(url)}, { method: 'POST', credentials: 'include', ` +
    `headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: ${JSON.stringify(KEY_NAME)} }) }); ` +
    `return { status: r.status, body: await r.text() }; })()`;
}

const isClosed = (e: unknown) => (e as Error)?.name === 'BrowserClosed';

/** Waits until the page sits on a logged-in URL for settleMs: a console that sends a logged-out visitor to its login
 *  page from its own script (Kimi's /console) first shows the console URL for a moment */
async function waitLoggedIn(browser: BrowserDriver, isLoggedIn: (url: string) => boolean, ms: number, settleMs: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0 || !(await browser.waitForUrl(isLoggedIn, left))) return false;
    if (settleMs <= 0) return true;
    await new Promise(r => setTimeout(r, settleMs));
    if (isLoggedIn(browser.url())) return true;
  }
}

type Level1 = { ok: true; key: string } | { ok: false; fallthrough: boolean; detail?: string };

async function level1(browser: BrowserDriver, url: string): Promise<Level1> {
  let res: { status: number; body: string };
  try {
    res = await browser.evaluate<{ status: number; body: string }>(createKeyScript(url));
  } catch (e) {
    if (isClosed(e)) throw e;
    return { ok: false, fallthrough: true };
  }
  const key = res.status < 300 ? extractKey(res.body) : null;
  if (key) return { ok: true, key };
  // The vendor answered but could not make a key (M-10): say so and let the user retry
  if (res.status >= 500) return { ok: false, fallthrough: false, detail: '厂商那边没建成 Key，等一下再试' };
  return { ok: false, fallthrough: true };
}

async function level2(browser: BrowserDriver, p: ProviderInfo, match: RegExp, ms: number): Promise<KeyOutcome> {
  await browser.open(p.keysUrl, { mode: 'expanded' });
  const deadline = Date.now() + ms;
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0) return { ok: false, reason: 'need-paste' };
    let body: string;
    try {
      body = await browser.waitForResponse(match, left);
    } catch (e) {
      if (isClosed(e)) return { ok: false, reason: 'cancelled' };
      return { ok: false, reason: 'need-paste' };
    }
    const key = extractKey(body);
    if (key) {
      browser.setMode('pip');
      return { ok: true, key, level: 2 };
    }
  }
}

export function makeVendor(provider: ProviderInfo, details: VendorDetails = {}): Vendor {
  const isLoggedIn = details.loggedIn ?? defaultLoggedIn(provider);
  const keyResponse = details.keyResponse ?? defaultKeyResponse(provider);
  const timeouts = details.timeouts ?? DEFAULT_TIMEOUTS;
  return {
    id: provider.id,
    provider,
    isLoggedIn,
    obtainKey: async (browser: BrowserDriver): Promise<KeyOutcome> => {
      if (provider.officialAccount) return { ok: false, reason: 'failed', detail: 'OpenAI 官方账号在 Codex 里登录，不用 Key' };
      try {
        if (!isLoggedIn(browser.url())) {
          // M-08: login page expanded so the user can scan; closing the browser = cancel (M-09)
          await browser.open(provider.loginUrl, { mode: 'expanded' });
          if (!(await waitLoggedIn(browser, isLoggedIn, timeouts.loginMs, timeouts.settleMs ?? 0))) return { ok: false, reason: 'cancelled' };
        }
        browser.setMode('pip');
        if (details.createKeyUrl) {
          const r = await level1(browser, details.createKeyUrl);
          if (r.ok) return { ok: true, key: r.key, level: 1 };
          if (!r.fallthrough) return { ok: false, reason: 'failed', detail: r.detail };
        }
        return await level2(browser, provider, keyResponse, timeouts.createMs);
      } catch (e) {
        if (isClosed(e)) return { ok: false, reason: 'cancelled' };
        return { ok: false, reason: 'failed', detail: '右侧浏览器出了点问题，再试一次' };
      }
    },
    openRecharge: async browser => {
      if (!provider.rechargeUrl) return false;
      await browser.open(provider.rechargeUrl, { mode: 'expanded' });
      return true;
    },
    openKeyManagement: async browser => { await browser.open(provider.keysUrl, { mode: 'expanded' }); },
  };
}
