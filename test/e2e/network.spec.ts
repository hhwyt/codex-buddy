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

test('N-01 打开直接显示平常界面，后台检查真实请求，超时弹网络问题，重试成功收起', async () => {
  run = await launch({ seed });
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible();
  run.config.setNetworkMode('slow');
  run = await run.relaunch();
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible();
  await expect(error()).toHaveCount(0);
  await expect(run.page.getByText('正在连接')).toHaveCount(0);
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
      buddy.invoke('zh:set', { on: true }), buddy.invoke('codex:restart'),
    ]);
  });
  for (const result of results) expect(result).toEqual({ ok: false, kind: 'network', reason: '网络问题' });
  expect(configToml(run.sandbox)).toBe(before);
  const child = run.app.process();
  await run.page.getByTestId(TID.network.quit).click();
  await expect.poll(() => child.exitCode !== null || child.signalCode !== null).toBe(true);
});

test('N-02 网络问题弹窗有去社群问问，社群页盖住 App，返回回到同一个弹窗，后台不放行', async () => {
  await offline();
  const community = run.page.getByTestId(TID.network.community);
  await expect(community).toBeVisible();
  await expect(community).toHaveText('去社群问问');
  await community.click();
  const full = run.page.getByTestId(TID.community.full);
  await expect(full).toBeVisible();
  await expect(run.page.getByTestId(TID.community.back)).toHaveText('← 返回');
  await expect(run.page.getByTestId(TID.community.qr)).toHaveAttribute('src', /community-qr\.png$/);
  // 社群页开着，后台功能接口仍然被拒绝，不能借社群页绕过网络检查
  const blocked = await run.page.evaluate(() => (window as unknown as { buddy: { invoke(c: string, a?: unknown): Promise<unknown> } }).buddy.invoke('install:run'));
  expect(blocked).toEqual({ ok: false, kind: 'network', reason: '网络问题' });
  await run.page.getByTestId(TID.community.back).click();
  await expect(full).toHaveCount(0);
  await expect(error()).toBeVisible();
  await expect(run.page.getByTestId(TID.network.community)).toBeVisible();
});

test('N-04 启动检查通过后用到一半断网不弹窗，界面照常', async () => {
  run = await launch({ seed });
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible();
  await run.page.getByTestId(TID.shell.navSettings).click();
  await expect(run.page.getByTestId(TID.settings.root)).toBeVisible();
  run.config.setNetworkMode('down');
  await run.page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await run.page.waitForTimeout(20_000);
  await expect(error()).toHaveCount(0);
  await run.page.getByTestId(TID.shell.navModels).click();
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible();
});

test('N-04 弹窗在时自动再查，网络恢复后弹窗自己收起', async () => {
  await offline();
  run.config.setNetworkMode('ok');
  await expect(error()).toHaveCount(0, { timeout: 10_000 });
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible();
});


test('N-06 未安装的手测入口也受联网限制，弹窗收起前点不了安装', async () => {
  run = await launch();
  await expect(run.page.getByTestId(TID.onboarding.start)).toBeVisible();
  run.config.setNetworkMode('down');
  run = await run.relaunch();
  await expect(error()).toBeVisible();
  const blocked = await run.page.evaluate(() => (window as unknown as { buddy: { invoke(c: string): Promise<unknown> } }).buddy.invoke('install:run'));
  expect(blocked).toEqual({ ok: false, kind: 'network', reason: '网络问题' });
  run.config.setNetworkMode('ok');
  await run.page.getByTestId(TID.network.retry).click();
  await expect(error()).toHaveCount(0);
  await expect(run.page.getByTestId(TID.onboarding.start)).toBeVisible();
});
