import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { TID } from '../../ui/testids';
import { dragToFront, nav } from './flows';
import { launch, wallet, type Launched } from './launch';

let run: Launched;
test.afterEach(async () => { await run?.close(); });

test('O-01 未安装提示条跨页面保留，卡片可拖动，安装成功后收起', async () => {
  run = await launch({ env: { CODEXBUDDY_FAKE_INSTALL_MS: '500' } });
  const { page } = run;
  await expect(page.getByTestId(TID.models.root)).toBeVisible();
  const banner = page.getByTestId(TID.onboarding.start);
  await expect(banner).toContainText('这台电脑还没装 Codex');
  await expect(page.getByTestId(TID.models.reinstall)).toHaveCount(0);
  await dragToFront(page, 'kimi');
  await expect.poll(async () => (await wallet(page)).order[0]).toBe('kimi');
  await nav.settings(page);
  await expect(banner).toBeVisible();
  await nav.community(page);
  await expect(banner).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('missing.png') });
  await banner.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByTestId(TID.onboarding.root);
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute('aria-modal', 'true');
  await page.screenshot({ path: test.info().outputPath('installing.png'), animations: 'disabled' });
  await expect(banner).toBeHidden({ timeout: 30_000 });
  await expect(drawer).toHaveCount(0);
  await expect(page.getByTestId(TID.models.root)).toBeVisible();
});

test('UI-00 提示文字与卡片同宽，图标、文字与按钮垂直对齐，侧栏使用新 Logo', async () => {
  run = await launch();
  const { page } = run;
  const banner = page.getByTestId(TID.onboarding.start);
  await expect(banner).toBeVisible();
  const metrics = await banner.evaluate(el => {
    const box = el.getBoundingClientRect();
    return { width: box.width, centers: [...el.children].map(c => { const r = c.getBoundingClientRect(); return r.y + r.height / 2; }) };
  });
  expect(metrics.width).toBe(380);
  expect(Math.max(...metrics.centers) - Math.min(...metrics.centers)).toBeLessThan(1);
  const logo = page.locator('.brand img');
  await expect(logo).toHaveAttribute('src', 'assets/icon.svg');
  expect(await logo.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const svg = await logo.evaluate(async el => (await fetch((el as HTMLImageElement).src)).text());
  expect(svg).toBe(readFileSync('build/icon.svg', 'utf8'));
  await page.screenshot({ path: test.info().outputPath('models.png') });
});
