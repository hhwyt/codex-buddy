// X-01 part 2: runs last. The real ~/.codex, ~/.codex-*, /Applications/ChatGPT.app, the 汉化版 entry and Codex's data
// dir hash exactly as before the suite, and nothing new appeared in /Applications. When the suite was filtered and
// part 1 did not run, this test makes its own baseline and drives a short full flow in between. Owner: A7.
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import { TID } from '../../ui/testids';
import { applicationsListing, hashAll, realProtectedPaths, SNAPSHOT_FILE } from './hash';
import { clickClear, finishOnboarding, nav, switchTo } from './flows';
import { launch, seedCodex, seedUserData } from './launch';

test('X-01 测试版跑完全部端到端后，真实 ~/.codex 和 /Applications/ChatGPT.app 的哈希不变', async () => {
  let before: { hashes: Record<string, string>; applications: string[] } | null = null;
  try { before = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8')); } catch { before = null; }
  if (!before) {
    before = { hashes: hashAll(realProtectedPaths()), applications: applicationsListing() };
    const run = await launch({ seed: s => { seedCodex(s); seedUserData(s); } });
    try {
      await finishOnboarding(run.page);
      await switchTo(run, 'deepseek');
      await nav.settings(run.page);
      await run.page.getByTestId(TID.settings.zhCard).click();
      await clickClear(run.page.getByTestId(TID.settings.restore));
      await run.page.getByTestId(TID.dialog.confirm).click();
    } finally {
      await run.close();
    }
  }
  const after = hashAll(realProtectedPaths());
  // Paths that appeared or vanished show up as a hash change ('absent' is hashed too)
  for (const p of new Set([...Object.keys(before.hashes), ...Object.keys(after)])) {
    expect.soft(after[p] ?? 'absent', p).toBe(before.hashes[p] ?? 'absent');
  }
  expect(applicationsListing()).toEqual(before.applications);
  fs.rmSync(SNAPSHOT_FILE, { force: true });
});
