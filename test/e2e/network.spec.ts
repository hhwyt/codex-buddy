import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TID } from '../../ui/testids';
import { launch, seedCodex, seedUserData, configToml, REPO, type Launched } from './launch';

let run: Launched;
test.afterEach(async () => { await run?.close(); });
const seed = (root: string) => { seedCodex(root); seedUserData(root); };
const error = () => run.page.getByTestId(TID.network.error);

async function offline(): Promise<void> {
  run = await launch({ seed });
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible();
  run.config.setNetworkMode('down');
  run = await run.relaunch();
  await expect(error()).toBeVisible();
}

test('N-01 启动检查真实请求，超时显示网络问题，重试成功才能进入', async () => {
  run = await launch({ seed });
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible();
  run.config.setNetworkMode('slow');
  run = await run.relaunch();
  await expect(run.page.getByTestId(TID.network.loading)).toBeVisible();
  await expect(run.page.getByTestId(TID.shell.side)).toHaveCount(0);
  await expect(error()).toBeVisible({ timeout: 12_000 });
  await expect(error()).toContainText('网络问题');
  await expect(error()).toContainText('请检查网络后重试。');
  const folder = path.join(REPO, '.ai', 'work', 'network-gate', 'screenshots');
  fs.mkdirSync(folder, { recursive: true });
  await run.page.screenshot({ path: path.join(folder, `network-failure-${process.platform}.png`) });
  run.config.setNetworkMode('ok');
  await run.page.getByTestId(TID.network.retry).click();
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible();
  await expect(run.page.getByTestId(TID.network.root)).toBeHidden();
  await run.page.screenshot({ path: path.join(folder, `network-connected-${process.platform}.png`) });
});

test('N-02 N-03 缓存不放行，Esc 和背景不能跳过，后台拒绝修改配置，退出关闭应用', async () => {
  await offline();
  const before = configToml(run.sandbox);
  await run.page.keyboard.press('Escape');
  await run.page.locator('.network-scrim').click({ position: { x: 5, y: 5 } });
  await expect(error()).toBeVisible();
  const results = await run.page.evaluate(async () => {
    const buddy = (window as unknown as { buddy: { invoke(channel: string, args?: unknown): Promise<unknown> } }).buddy;
    return Promise.all([
      buddy.invoke('install:run'), buddy.invoke('switch:start', { vendor: 'kimi' }),
      buddy.invoke('zh:set', { on: true }), buddy.invoke('wallet:get'), buddy.invoke('codex:restart'),
    ]);
  });
  for (const result of results) expect(result).toEqual({ ok: false, kind: 'network', reason: '网络问题' });
  expect(configToml(run.sandbox)).toBe(before);
  const child = run.app.process();
  await run.page.getByTestId(TID.network.quit).click();
  await expect.poll(() => child.exitCode !== null || child.signalCode !== null).toBe(true);
});

test('N-04 使用中失联自动锁定，重试后恢复原页面，系统断网立即锁定', async () => {
  run = await launch({ seed });
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible();
  await run.page.getByTestId(TID.shell.navSettings).click();
  await expect(run.page.getByTestId(TID.settings.root)).toBeVisible();
  run.config.setNetworkMode('down');
  await expect(error()).toBeVisible({ timeout: 22_000 });
  await expect(run.page.getByTestId(TID.settings.root)).toBeHidden();
  run.config.setNetworkMode('ok');
  await run.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(error()).toBeVisible();
  await run.page.getByTestId(TID.network.retry).click();
  await expect(run.page.getByTestId(TID.settings.root)).toBeVisible();
  await run.page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(error()).toBeVisible();
  await run.page.getByTestId(TID.network.retry).click();
  await expect(run.page.getByTestId(TID.settings.root)).toBeVisible();
});


test('N-06 未安装的手测入口也受联网限制，重试通过才显示安装按钮', async () => {
  run = await launch();
  await expect(run.page.getByTestId(TID.onboarding.start)).toBeVisible();
  run.config.setNetworkMode('down');
  run = await run.relaunch();
  await expect(error()).toBeVisible();
  await expect(run.page.getByTestId(TID.onboarding.start)).toHaveCount(0);
  run.config.setNetworkMode('ok');
  await run.page.getByTestId(TID.network.retry).click();
  await expect(run.page.getByTestId(TID.onboarding.start)).toBeVisible();
});
