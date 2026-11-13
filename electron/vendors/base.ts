// Shared vendor behaviour; each vendor file only adds its console API details. Owner: A4.
import { todo } from '../core/todo';
import type { ProviderInfo } from '../core/types';
import type { BrowserDriver, KeyOutcome, Vendor } from './types';

export interface VendorDetails {
  /** URL test for a logged-in console page */
  loggedIn: (url: string) => boolean;
  /** Level 1: script run in the console page that creates a key named CodexBuddy and returns it */
  createKeyScript?: string;
  /** Level 2: response URL pattern that carries a freshly created key */
  keyResponse?: RegExp;
}

export function makeVendor(provider: ProviderInfo, details: VendorDetails): Vendor {
  return {
    id: provider.id,
    provider,
    isLoggedIn: details.loggedIn,
    obtainKey: async (_browser: BrowserDriver): Promise<KeyOutcome> => todo('A4', `${provider.id} obtainKey`),
    openRecharge: async browser => {
      if (!provider.rechargeUrl) return false;
      await browser.open(provider.rechargeUrl, { mode: 'expanded' });
      return true;
    },
    openKeyManagement: async browser => { await browser.open(provider.keysUrl, { mode: 'expanded' }); },
  };
}
