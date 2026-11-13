// The page's view of the main process: window.buddy from electron/preload.ts. Tests pass a fake instead.
import type { BuddyApi } from '../electron/main/ipc-contract.js';

export type { BuddyApi };

declare global {
  interface Window { buddy?: BuddyApi }
}

export function windowApi(): BuddyApi {
  if (!window.buddy) throw new Error('window.buddy missing: the page runs outside CodexBuddy');
  return window.buddy;
}
