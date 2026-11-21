// What every page gets. Owner: Base (frozen). A page renders into ctx.root and returns an optional cleanup.
import type { BuddyApi } from '../api.js';

export type Route = 'models' | 'settings' | 'community' | 'shop';

export interface PageContext {
  api: BuddyApi;
  root: HTMLElement;
  /** Set when the page is reached from 去社群咨询 and the log was copied (E-02) */
  copied?: boolean;
  /** Set when the page is reached from the OpenAI card's shop entries: the item to point at (F-08) */
  highlight?: 'sms' | 'gpt';
  go(route: Route, opts?: { copied?: boolean; highlight?: 'sms' | 'gpt' }): void;
}

export type Page = (ctx: PageContext) => void | (() => void) | Promise<void | (() => void)>;
