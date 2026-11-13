// G-01 data protection end to end: every removal the UI offers (去掉汉化版, 删除分身, 一键还原) leaves ~/.codex,
// ~/.codex-<名字> and Codex's data dir byte for byte as they were (inside the sandbox), and the real ones on this
// machine are untouched too (read-only hashes). Restore only undoes CodexBuddy's own changes. Owner: A7.
import { expect, test } from '@playwright/test';
import * as path from 'node:path';
import { TID } from '../../ui/testids';
import { finishOnboarding, nav, switchTo } from './flows';
import { hashAll, hashTree, realProtectedPaths } from './hash';
import { cloneHome, codexDataDir, codexHome, launch, seedCodex, seedUserData, type Launched } from './launch';
import { BASE_NEEDS, merge, needs } from './pending';

let run: Launched;
needs(merge(BASE_NEEDS, { ui: { settings: ['TID.settings.zhTrash', 'TID.settings.restore'], models: ['TID.models.cloneRemove('] }, ipc: ['zh:remove', 'clone:remove', 'restore:run'] }));
test.afterEach(async () => { await run?.close(); });

test('G-01 去掉汉化版、删除分身、一键还原前后，数据目录的哈希不变', async () => {
  const real = hashAll(realProtectedPaths());
  run = await launch({ seed: s => { seedCodex(s); seedUserData(s, ['deepseek']); } });
  const { page, sandbox } = run;
  const data = () => ({
    codex: hashTree(codexHome(sandbox)),
    sessions: hashTree(path.join(codexHome(sandbox), 'sessions')),
    clone: hashTree(cloneHome(sandbox, 'deepseek')),
    cloneSessions: hashTree(path.join(cloneHome(sandbox, 'deepseek'), 'sessions')),
    electron: hashTree(codexDataDir(sandbox)),
  });
  const initial = data();
  await finishOnboarding(page);
  await switchTo(run, 'kimi');

  // 去掉汉化版
  await nav.settings(page);
  await page.getByTestId(TID.settings.zhCard).click();
  await expect(page.getByTestId(TID.settings.zhTrash)).toBeVisible({ timeout: 10_000 });
  let before = data();
  await page.getByTestId(TID.settings.zhTrash).click();
  await expect(page.getByTestId(TID.settings.zhTrash)).toHaveCount(0, { timeout: 10_000 });
  expect(data()).toEqual(before);

  // 删除分身
  await nav.models(page);
  await page.getByTestId(TID.models.modeClone).click();
  await page.getByTestId(TID.models.cloneMake('deepseek')).click();
  await expect(page.getByTestId(TID.models.cloneOpen('deepseek'))).toBeVisible({ timeout: 30_000 });
  before = data();
  await page.getByTestId(TID.models.cloneRemove('deepseek')).click();
  await page.getByTestId(TID.dialog.confirm).click();
  await expect(page.getByTestId(TID.models.cloneMake('deepseek'))).toBeVisible({ timeout: 20_000 });
  expect(data()).toEqual(before);

  // 一键还原: ~/.codex back to exactly what the user had; chat history and Codex's own data untouched
  await page.getByTestId(TID.models.modeSwitch).click();
  await nav.settings(page);
  before = data();
  await page.getByTestId(TID.settings.restore).click();
  await page.getByTestId(TID.dialog.confirm).click();
  await expect(page.getByTestId(TID.onboarding.root)).toBeVisible({ timeout: 30_000 });
  const after = data();
  expect(after.codex).toBe(initial.codex);
  expect(after.sessions).toBe(before.sessions);
  expect(after.cloneSessions).toBe(before.cloneSessions);
  expect(after.electron).toBe(before.electron);

  expect(hashAll(realProtectedPaths())).toEqual(real);
});
