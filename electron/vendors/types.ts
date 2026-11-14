// Vendor flows in the right-side browser. FROZEN by Base. Owner of implementations: A4.
// Key ladder (build-plan §2): 1) after login call the console API to create a key named CodexBuddy;
// 2) else let the user click「创建」on the official page and catch the key from the page's response;
// 3) else show the hidden「粘贴 Key」fallback. Never click a pay button (M-18).
import type { BuiltinVendorId, ProviderInfo } from '../core/types';

/** What a vendor flow may do with the right-side browser (implemented by electron/main/browser.ts) */
export interface BrowserDriver {
  open(url: string, opts: { mode: 'pip' | 'expanded' }): Promise<void>;
  /** Current URL of the browser view */
  url(): string;
  /** Runs a script in the page (same-origin fetch to the console API with the page's own cookies) */
  evaluate<T>(script: string): Promise<T>;
  /** Resolves with the first response body whose URL matches (level-2 key capture) */
  waitForResponse(match: RegExp, timeoutMs: number): Promise<string>;
  /** Resolves true once the predicate on the URL holds (login detected), false if the user closed the browser (M-09) */
  waitForUrl(predicate: (url: string) => boolean, timeoutMs: number): Promise<boolean>;
  setMode(mode: 'pip' | 'expanded'): void;
  /** Whether the browser's login store holds a cookie with this name for this URL (logins a URL cannot tell) */
  hasCookie(url: string, name: string): Promise<boolean>;
}

export type KeyOutcome =
  | { ok: true; key: string; level: 1 | 2 | 3 }
  | { ok: false; reason: 'cancelled' | 'failed' | 'need-paste'; detail?: string };

export interface Vendor {
  id: BuiltinVendorId;
  provider: ProviderInfo;
  /** Login if needed, then get a key through the 3-level ladder (M-08, M-10, M-17). onCreate: level 2 starts, the
   *  user has to click「创建」on the official page */
  obtainKey(browser: BrowserDriver, onCreate?: () => void): Promise<KeyOutcome>;
  /** Detects a logged-in page from its URL */
  isLoggedIn(url: string): boolean;
  /** Opens the recharge page expanded; returns false for vendors without one (M-18) */
  openRecharge(browser: BrowserDriver): Promise<boolean>;
  /** Opens the official key management page (S-03) */
  openKeyManagement(browser: BrowserDriver): Promise<void>;
}
