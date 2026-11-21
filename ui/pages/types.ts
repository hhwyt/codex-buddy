// What every page gets. Owner: Base (frozen). A page renders into ctx.root and returns an optional cleanup.
import type { BuddyApi } from '../api.js';

export type Route = 'models' | 'settings' | 'community' | 'shop';

export interface PageContext {
  api: BuddyApi;
  root: HTMLElement;
  /** Set when the page is reached from 去社群咨询 and the log was copied (E-02) */
  copied?: boolean;
  go(route: Route, opts?: { copied?: boolean }): void;
}

export type Page = (ctx: PageContext) => void | (() => void) | Promise<void | (() => void)>;
