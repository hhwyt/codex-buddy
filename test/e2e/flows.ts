// User flows shared by the e2e specs: page navigation, card clicks and drags, the fake QR login. Owner: A7.
// Everything goes through ui/testids.ts and the IPC contract; nothing depends on class names or internal storage.
import { expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { TID } from '../../ui/testids';
import { CARD_HEIGHT } from '../../ui/components/card';
import { wallet, type Launched } from './launch';

export const nav = {
  models: (page: Page) => page.getByTestId(TID.shell.navModels).click(),
  settings: (page: Page) => page.getByTestId(TID.shell.navSettings).click(),
  community: (page: Page) => page.getByTestId(TID.shell.navCommunity).click(),
  shop: (page: Page) => page.getByTestId(TID.shell.navShop).click(),
};

/** Installs through the shared banner when Codex is missing. */
export async function finishOnboarding(page: Page): Promise<void> {
  await expect(page.getByTestId(TID.models.root)).toBeVisible();
  const banner = page.getByTestId(TID.onboarding.start);
  if (await banner.isVisible()) {
    await banner.click();
    await expect(banner).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId(TID.onboarding.root)).toHaveCount(0);
  }
}

/** URL of every webContents the main process has (the right-side browser is one of them) */
export const webContentsUrls = (app: ElectronApplication) =>
  app.evaluate(({ webContents }) => webContents.getAllWebContents().map(w => w.getURL()));

/** Waits for a webContents whose URL contains `part` and runs `js` in it (the fake QR scan, reading the page) */
export async function inWebContents(app: ElectronApplication, part: string, js: string, timeout = 20_000): Promise<unknown> {
  const until = Date.now() + timeout;
  for (;;) {
    const result = await app.evaluate(async ({ webContents }, a) => {
      const wc = webContents.getAllWebContents().find(w => w.getURL().includes(a.part) && !w.isLoading());
      // userGesture: like a real click, so Chromium keeps the page in the back history
      return wc ? { found: true, value: await wc.executeJavaScript(a.js, true) } : { found: false, value: null };
    }, { part, js });
    if (result.found) return result.value;
    if (Date.now() > until) throw new Error(`no webContents with ${part}; have ${(await webContentsUrls(app)).join(', ')}`);
    await new Promise(r => setTimeout(r, 200));
  }
}

/** The fake vendor's login page: its button stands in for the QR scan */
export const fakeScan = (app: ElectronApplication, vendor: string) =>
  inWebContents(app, `/${vendor}/login`, `document.getElementById('fake-login').click(); true`);

/** Bounding boxes of every card, by vendor */
/** Waits until no card is mid-move (the pile slides when cards reorder and when the picture-in-picture opens or closes) */
export const cardsSettled = (page: Page) => page.waitForFunction(() =>
  !document.getAnimations().some(a => a instanceof CSSTransition && (a.effect as KeyframeEffect | null)?.target instanceof HTMLElement && ((a.effect as KeyframeEffect).target as HTMLElement).classList.contains('card')));

export async function cardBoxes(page: Page, vendors: string[]): Promise<Record<string, { x: number; y: number; width: number; height: number }>> {
  await cardsSettled(page);
  const out: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const v of vendors) {
    const b = await page.getByTestId(TID.models.card(v)).boundingBox();
    if (b) out[v] = b;
  }
  return out;
}

/** The card on top of the pile (order[0]): at the top of the page, whole once one is in use (model-page-top.html) */
export async function frontCard(page: Page): Promise<string> {
  return (await wallet(page)).order[0];
}

/** Drags a card by its header to the given y (page coordinates), in small steps like a hand would */
export async function dragCardTo(page: Page, vendor: string, toY: number, onMove?: () => Promise<void>): Promise<void> {
  await cardsSettled(page);
  const box = (await page.getByTestId(TID.models.card(vendor)).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + 45 * box.height / CARD_HEIGHT;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x, y + ((toY - y) * i) / steps);
    if (i === steps / 2 && onMove) await onMove();
  }
  await page.mouse.up();
}

/** Drags a back card all the way to the front position */
export async function dragToFront(page: Page, vendor: string): Promise<void> {
  await cardsSettled(page);
  const front = await frontCard(page);
  const fb = (await page.getByTestId(TID.models.card(front)).boundingBox())!;
  await dragCardTo(page, vendor, fb.y + 45 * fb.height / CARD_HEIGHT);
}

/** Switches to a vendor by clicking its card, scanning the fake QR code when a login page shows up */
export async function switchTo(run: Launched, vendor: string, opts: { expectOk?: boolean; via?: 'click' | 'drag'; keepOpenPrompt?: boolean } = {}): Promise<void> {
  const { page, app } = run;
  if (opts.via === 'drag') await dragToFront(page, vendor);
  else {
    await cardsSettled(page);
    const card = page.getByTestId(TID.models.card(vendor));
    const scale = await card.evaluate(el => el.getBoundingClientRect().width / (el as HTMLElement).offsetWidth);
    await card.click({ position: { x: 60 * scale, y: 25 * scale } });
  }
  if (vendor !== 'openai') {
    // Login is only needed the first time; ignore when the vendor needs none
    await fakeScan(app, vendor).catch(() => undefined);
  }
  if (opts.expectOk === false) return;
  await expect.poll(async () => (await wallet(page)).active, { timeout: 30_000 }).toBe(vendor);
  if (!opts.keepOpenPrompt) {
    const open = page.getByTestId(TID.restart.root).filter({ has: page.getByRole('button', { name: '打开 ChatGPT', exact: true }) });
    await open.waitFor({ state: 'visible', timeout: 2000 }).then(() => open.getByTestId(TID.restart.later).click()).catch(() => undefined);
  }
  const dlg = page.getByTestId(TID.firstSuccess.root);
  if (await dlg.isVisible().catch(() => false)) await page.keyboard.press('Escape');
}

/** Clicks a dialog's confirm button */
export const confirmDialog = (page: Page) => page.getByTestId(TID.dialog.confirm).click();

/** All visible text of the window (for wording scans and key scans) */
export const visibleText = (page: Page) => page.evaluate(() => document.body.innerText);
export const fullHtml = (page: Page) => page.content();

/** 做成分身: clicks the card's button and scans the fake QR code when the vendor's login page shows up (first key) */
export async function makeCloneOf(app: ElectronApplication, page: Page, vendor: string): Promise<void> {
  await page.getByTestId(TID.models.cloneMake(vendor)).click();
  await fakeScan(app, vendor).catch(() => undefined);
  await expect(page.getByTestId(TID.models.cloneOpen(vendor))).toBeVisible({ timeout: 30_000 });
}

/** Scrolls an element to the middle of its page first: the picture-in-picture window may sit over the bottom right */
export async function clickClear(loc: Locator): Promise<void> {
  await loc.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await loc.click();
}
