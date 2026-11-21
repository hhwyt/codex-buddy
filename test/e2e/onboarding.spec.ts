// Onboarding O-01..O-08 (approved-spec §3 引导 O), against the sandboxed app. Owner: A7.
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TID } from '../../ui/testids';
import { finishOnboarding, switchTo } from './flows';
import { clipboard, launch, seedCodex, type Launched } from './launch';
import { clearSteps, recordSteps, steps } from './steps';
import { BASE_NEEDS, merge, needs } from './pending';

let run: Launched;
needs(merge(BASE_NEEDS, { ui: { onboarding: ['TID.onboarding.retry', 'TID.onboarding.fixing'], community: ['TID.community.qr'] }, ipc: ['install:log'] }));
test.afterEach(async () => { await run?.close(); });

const FULL_KEY = /sk-[A-Za-z0-9_-]{12,}/;

test('O-01 点「去安装」进度依次打勾后进模型页', async () => {
  run = await launch();
  const { page } = run;
  await expect(page.getByTestId(TID.models.root)).toBeVisible();
  await recordSteps(page);
  await page.getByTestId(TID.onboarding.start).click();
  await expect(page.getByTestId(TID.onboarding.start)).toBeHidden({ timeout: 30_000 });
  await expect(page.getByTestId(TID.onboarding.root)).toHaveCount(0);
  const install = (await steps(page)).filter(s => s.flow === 'install');
  expect(install.length).toBeGreaterThan(0);
  // every step that started also finished, in the order they started, and none failed
  const started = install.filter(s => s.state === 'start').map(s => s.id);
  const done = install.filter(s => s.state === 'done').map(s => s.id);
  expect(done).toEqual(started);
  expect(install.some(s => s.state === 'fail')).toBe(false);
});

test('O-02 已经装了 Codex 直接进模型页，不显示安装提示或启动安装', async () => {
  run = await launch({ seed: s => seedCodex(s) });
  const { page } = run;
  await expect(page.getByTestId(TID.models.root)).toBeVisible();
  await expect(page.getByTestId(TID.onboarding.start)).toBeHidden();
  await expect(page.getByTestId(TID.onboarding.root)).toHaveCount(0);
  expect(fs.readFileSync(path.join(run.sandbox, 'Applications', 'Test-ChatGPT.app', 'Contents', 'Info.plist'), 'utf8')).toContain('26.1.0');
});

test('O-03 安装失败进故障屏，再试一次从失败的那一步接着做', async () => {
  run = await launch({ env: { CODEXBUDDY_FAKE_INSTALL: 'fail-once' } });
  const { page } = run;
  await recordSteps(page);
  await page.getByTestId(TID.onboarding.start).click();
  await expect(page.getByTestId(TID.onboarding.failure)).toBeVisible({ timeout: 30_000 });
  const first = (await steps(page)).filter(s => s.flow === 'install');
  const failed = first.find(s => s.state === 'fail')!;
  expect(failed).toBeTruthy();
  const doneBefore = first.filter(s => s.state === 'done').map(s => s.id);
  await clearSteps(page);
  await page.getByTestId(TID.onboarding.retry).click();
  await expect(page.getByTestId(TID.onboarding.start)).toBeHidden({ timeout: 30_000 });
  await expect(page.getByTestId(TID.onboarding.root)).toHaveCount(0);
  const second = (await steps(page)).filter(s => s.flow === 'install' && s.state === 'start').map(s => s.id);
  expect(second[0]).toBe(failed.id);
  for (const id of doneBefore) expect(second).not.toContain(id);
});

test('O-04 故障屏点去社群咨询：复制打码日志并进社群页', async () => {
  run = await launch({ env: { CODEXBUDDY_FAKE_INSTALL: 'fail' } });
  const { page, app } = run;
  await page.getByTestId(TID.onboarding.start).click();
  await expect(page.getByTestId(TID.onboarding.failure)).toBeVisible({ timeout: 30_000 });
  await page.getByTestId(TID.help).click();
  await expect(page.getByTestId(TID.community.root)).toBeVisible();
  await expect(page.getByTestId(TID.community.copied)).toBeVisible();
  await expect(page.getByTestId(TID.community.qr)).toBeVisible();
  await expect.poll(() => clipboard(app)).not.toBe('');
  expect(await clipboard(app)).not.toMatch(FULL_KEY);
});

test('O-06 已经配过模型的重启后跳过引导直接进模型页', async () => {
  run = await launch({ seed: s => seedCodex(s) });
  await finishOnboarding(run.page);
  await switchTo(run, 'deepseek');
  run = await run.relaunch();
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible();
  await expect(run.page.getByTestId(TID.onboarding.root)).toHaveCount(0);
});

test('O-07 安装中途关掉再打开已下载的不重下并回到模型页提示条', async () => {
  run = await launch();
  const { page } = run;
  await recordSteps(page);
  await page.getByTestId(TID.onboarding.start).click();
  await expect.poll(async () => (await steps(page)).some(s => s.flow === 'install' && s.state === 'done'), { timeout: 30_000 }).toBe(true);
  const downloads = path.join(run.home, process.platform === 'win32' ? 'AppData/Local/CodexBuddy' : 'Library/Application Support/CodexBuddy', 'downloads');
  run = await run.relaunch();
  await expect(run.page.getByTestId(TID.onboarding.start)).toBeVisible();
  const snapshot = (dir: string) => fs.existsSync(dir) ? fs.readdirSync(dir).map(f => `${f}:${fs.statSync(path.join(dir, f)).mtimeMs}`).sort() : [];
  const before = snapshot(downloads);
  await run.page.getByTestId(TID.onboarding.start).click();
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible({ timeout: 30_000 });
  // Files downloaded before the quit are reused, not fetched again
  for (const entry of before) expect(snapshot(downloads)).toContain(entry);
});

test('O-08 安装中自动修小问题显示正在帮你修', async () => {
  run = await launch({ env: { CODEXBUDDY_FAKE_INSTALL: 'fix' } });
  const { page } = run;
  await page.getByTestId(TID.onboarding.start).click();
  await expect(page.getByTestId(TID.onboarding.fixing)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(TID.onboarding.fixing)).toContainText('正在帮你修');
  await expect(page.getByTestId(TID.onboarding.start)).toBeHidden({ timeout: 30_000 });
  await expect(page.getByTestId(TID.onboarding.root)).toHaveCount(0);
});
