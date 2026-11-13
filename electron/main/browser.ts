// The right-side browser (PRD §3.6) with picture-in-picture. Owner: A4.
// B-01 PiP bottom right while automating; B-02 expanded for scan / pay: the window widens ~480px, or covers the right
// half when the screen is too narrow; B-03 click PiP or 🌐 → expand, can shrink back; B-04 only ✕ closes, page
// switches leave it alone; B-05 read-only address bar, back and reload; B-06 closed at start; B-07 own session
// partition (persist:codexbuddy-browser), never the user's Chrome. Every request host is logged as「网页里连过的」.
import { todo } from '../core/todo';
import type { BrowserDriver } from '../vendors/types';

export const BROWSER_PARTITION = 'persist:codexbuddy-browser';
export const EXPANDED_EXTRA_WIDTH = 480;

export function createRightBrowser(): BrowserDriver & { close(): void } {
  return {
    open: async () => todo('A4', 'browser open'),
    url: () => todo('A4', 'browser url'),
    evaluate: async () => todo('A4', 'browser evaluate'),
    waitForResponse: async () => todo('A4', 'browser waitForResponse'),
    waitForUrl: async () => todo('A4', 'browser waitForUrl'),
    setMode: () => todo('A4', 'browser setMode'),
    close: () => todo('A4', 'browser close'),
  };
}
