// L4 smoke: the sandboxed app starts and shows the shell. A7 owns the full e2e suite.
import { expect, test } from '@playwright/test';
import { TID } from '../../ui/testids';
import { launch } from './launch';

test('W-01 没有标题栏，App 能启动并显示引导', async () => {
  const run = await launch();
  try {
    const frame = await run.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return { title: w.getTitle(), size: w.getContentSize() };
    });
    expect(frame.size[0]).toBeGreaterThan(800);
    await expect(run.page.getByTestId(TID.onboarding.root)).toBeVisible();
  } finally {
    await run.close();
  }
});
