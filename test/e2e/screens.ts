// Shared checks visit installation, both model modes, settings, community and the security panel.
import { expect, type Page } from '@playwright/test';
import { TID } from '../../ui/testids';
import { finishOnboarding, nav } from './flows';
import { launch, seedCodex, seedUserData, type Launched } from './launch';

export type Screen = 'uninstalled' | 'install-failure' | 'models' | 'clones' | 'settings' | 'community' | 'security';

export async function forEachScreen(check: (page: Page, screen: Screen, run: Launched) => Promise<void>, onLaunch?: (run: Launched) => void): Promise<void> {
  const fresh = await launch({ env: { CODEXBUDDY_FAKE_INSTALL: 'fail-once' } });
  onLaunch?.(fresh);
  try {
    await expect(fresh.page.getByTestId(TID.onboarding.start)).toBeVisible();
    await check(fresh.page, 'uninstalled', fresh);
    await fresh.page.getByTestId(TID.onboarding.start).click();
    await expect(fresh.page.getByTestId(TID.onboarding.failure)).toBeVisible();
    await check(fresh.page, 'install-failure', fresh);
  } finally { await fresh.close(); }
  const run = await launch({ seed: s => { seedCodex(s); seedUserData(s); } });
  onLaunch?.(run);
  try {
    const { page } = run;
    await expect(page.getByTestId(TID.models.root)).toBeVisible();
    await finishOnboarding(page);
    await check(page, 'models', run);
    await page.getByTestId(TID.models.modeClone).click();
    await page.waitForTimeout(800);
    await check(page, 'clones', run);
    await page.getByTestId(TID.models.modeSwitch).click();
    await nav.settings(page);
    await expect(page.getByTestId(TID.settings.root)).toBeVisible();
    await check(page, 'settings', run);
    await nav.community(page);
    await expect(page.getByTestId(TID.community.root)).toBeVisible();
    await check(page, 'community', run);
    await page.getByTestId(TID.shell.security).click();
    await expect(page.getByTestId(TID.security.root)).toBeVisible();
    await check(page, 'security', run);
  } finally {
    await run.close();
  }
}

/** Colors defined in ui/tokens.css (:root custom properties), normalised by the browser to rgb()/rgba() */
export const tokenColors = (page: Page) => page.evaluate(() => {
  const out = new Set<string>(['rgba(0, 0, 0, 0)', 'transparent']);
  const probe = document.createElement('div');
  document.body.appendChild(probe);
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules)) {
      const style = (rule as CSSStyleRule).style;
      if (!style || !/^:root/.test((rule as CSSStyleRule).selectorText ?? '')) continue;
      for (const name of Array.from(style)) {
        if (!name.startsWith('--')) continue;
        probe.style.color = '';
        probe.style.color = style.getPropertyValue(name).trim();
        if (probe.style.color) out.add(getComputedStyle(probe).color);
      }
    }
  }
  probe.remove();
  return [...out];
});

/** Every visible element's painted colors and background images */
export const paintedColors = (page: Page) => page.evaluate(() => {
  const found: { el: string; prop: string; value: string }[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('svg') || el.tagName === 'IMG') continue;
    const tag = `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ''}.${el.className}`;
    const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent!.trim());
    if (hasText) found.push({ el: tag, prop: 'color', value: cs.color });
    found.push({ el: tag, prop: 'background-color', value: cs.backgroundColor });
    if (parseFloat(cs.borderTopWidth) > 0) found.push({ el: tag, prop: 'border-color', value: cs.borderTopColor });
    if (cs.backgroundImage !== 'none') found.push({ el: tag, prop: 'background-image', value: cs.backgroundImage });
    if (cs.boxShadow !== 'none') found.push({ el: tag, prop: 'box-shadow', value: cs.boxShadow });
  }
  return found;
});
