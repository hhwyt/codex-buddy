// What every page gets. Owner: Base (frozen). A page renders into ctx.root and returns an optional cleanup.
import type { BuddyApi } from '../api.js';

export type Route = 'onboarding' | 'models' | 'settings' | 'help';

export interface PageContext {
  api: BuddyApi;
  root: HTMLElement;
  go(route: Route): void;
}

export type Page = (ctx: PageContext) => void | (() => void) | Promise<void | (() => void)>;
