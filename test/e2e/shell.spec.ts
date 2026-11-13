// Window and shared checks: W-01..W-04, UI-00..UI-02, H-03. Owner: A7.
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TID } from '../../ui/testids';
import { fakeScan, finishOnboarding, nav } from './flows';
import { filesUnder, launch, REPO, seedCodex, seedUserData, setCodexScenario, wallet, vendorState, type Launched } from './launch';
import { forEachScreen, paintedColors, tokenColors } from './screens';
import { clearSteps, recordSteps, steps } from './steps';
import { BASE_NEEDS, merge, needs } from './pending';

let run: Launched | undefined;
needs(merge(BASE_NEEDS, { ui: { settings: ['TID.settings.root'], help: ['TID.help.root'], security: ['TID.security.root'], models: ['TID.models.modeClone'] } }));
test.afterEach(async () => { await run?.close(); run = undefined; });

test('W-01 没有标题栏，Mac 红绿灯嵌在左栏顶上，Windows 右上角有三个窗口按钮', async () => {
  run = await launch();
  const frame = await run.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return { size: w.getSize(), content: w.getContentSize() };
  });
  expect(frame.content[0]).toBeGreaterThan(800);
  await expect(run.page.getByTestId(TID.onboarding.root)).toBeVisible();
  // no system title bar: the page owns the whole window height
  expect(frame.content[1]).toBe(frame.size[1]);
  if (process.platform === 'win32') {
    expect(await run.page.evaluate(() => (navigator as unknown as { windowControlsOverlay?: { visible: boolean } }).windowControlsOverlay?.visible ?? false)).toBe(true);
  }
  await finishOnboarding(run.page);
  const side = (await run.page.getByTestId(TID.shell.side).boundingBox())!;
  expect(side.x).toBe(0);
  expect(side.y).toBe(0); // the left column runs to the top edge, under the traffic lights
  await expect(run.page).toHaveScreenshot('window-models.png', { animations: 'disabled', maxDiffPixelRatio: 0.01 });
});

test('W-02 左栏切换模型、设置、帮助', async () => {
  run = await launch({ seed: s => seedCodex(s) });
  await finishOnboarding(run.page);
  const pairs: [string, string][] = [[TID.shell.navSettings, TID.settings.root], [TID.shell.navHelp, TID.help.root], [TID.shell.navModels, TID.models.root]];
  for (const [button, root] of pairs) {
    await run.page.getByTestId(button).click();
    await expect(run.page.getByTestId(root)).toBeVisible();
    await expect(run.page.getByTestId(button)).toHaveAttribute('aria-current', 'page');
  }
});

test('W-03 断网时正在做的那一步失败，再试一次从失败处接着做', async () => {
  // The network drops while Codex downloads (the sandbox installer fails the download once)
  run = await launch({ env: { CODEXBUDDY_FAKE_INSTALL: 'fail-once' }, seed: s => seedUserData(s) });
  await recordSteps(run.page);
  await run.page.getByTestId(TID.onboarding.start).click();
  await expect(run.page.getByTestId(TID.onboarding.failure)).toBeVisible({ timeout: 30_000 });
  const failed = (await steps(run.page)).find(s => s.state === 'fail')!;
  const doneBefore = (await steps(run.page)).filter(s => s.flow === failed.flow && s.state === 'done').map(s => s.id);
  await clearSteps(run.page);
  await run.page.getByTestId(TID.onboarding.retry).click(); // 再试一次
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible({ timeout: 30_000 });
  const again = (await steps(run.page)).filter(s => s.state === 'start').map(s => s.id);
  expect(again[0]).toBe(failed.id);
  for (const id of doneBefore) expect(again).not.toContain(id);
});

test('W-04 各屏截图和基线一致', async () => {
  await forEachScreen(async (page, screen) => {
    await expect(page).toHaveScreenshot(`screen-${screen}.png`, {
      animations: 'disabled', maxDiffPixelRatio: 0.01, mask: [page.getByTestId(TID.settings.version)],
    });
  });
});

test('UI-00 页面上画出来的颜色都来自 tokens.css，没有渐变和发光', async () => {
  await forEachScreen(async (page, screen) => {
    const allowed = new Set(await tokenColors(page));
    expect(allowed.size).toBeGreaterThan(5);
    for (const c of await paintedColors(page)) {
      if (c.prop === 'background-image') { expect.soft(c.value, `${screen} ${c.el}`).not.toMatch(/gradient/); continue; }
      if (c.prop === 'box-shadow') { expect.soft(c.value, `${screen} ${c.el} glow`).not.toMatch(/rgba?\([^)]*\)\s+0px\s+0px\s+\d{2,}px/); continue; }
      expect.soft(allowed.has(c.value) || /^rgba\(0, 0, 0, 0(\.\d+)?\)$/.test(c.value), `${screen} ${c.el} ${c.prop} ${c.value}`).toBe(true);
    }
  });
});

const FORBIDDEN = [/CC ?Switch/i, /傻瓜/, /HumansLive/i, /搭子/];
test('UI-01 文案没有禁用词，展示文字不加句末标点', async () => {
  await forEachScreen(async (page, screen) => {
    const texts = await page.evaluate(() => {
      const out: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const t = walker.currentNode.textContent!.trim();
        const el = walker.currentNode.parentElement!;
        if (t && el.offsetParent !== null && !['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT'].includes(el.tagName)) out.push(t);
      }
      return out;
    });
    for (const t of texts) {
      for (const f of FORBIDDEN) expect.soft(t, screen).not.toMatch(f);
      expect.soft(t, `${screen}: 句末标点`).not.toMatch(/[。！!]$/);
    }
  });
});

test('UI-02 每屏最多一个黑色实心主按钮', async () => {
  await forEachScreen(async (page, screen) => {
    const solid = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], a'))
      .filter(b => b.offsetParent !== null && getComputedStyle(b).backgroundColor === 'rgb(13, 13, 13)')
      .map(b => b.textContent?.trim()));
    expect(solid.length, `${screen}: ${solid.join(' / ')}`).toBeLessThanOrEqual(1);
  });
});

test('H-03 代码、网络请求、界面里都不出现 humanslive', async () => {
  const urls: string[] = [];
  await forEachScreen(async (page, screen) => {
    expect.soft(await page.content(), screen).not.toMatch(/humanslive/i);
  }, r => { r.app.context().on('request', req => urls.push(req.url())); });
  run = await launch({ seed: s => { seedCodex(s); seedUserData(s); } });
  run.app.context().on('request', req => urls.push(req.url()));
  await finishOnboarding(run.page);
  await run.page.getByTestId(TID.models.card('zhipu')).click({ position: { x: 60, y: 45 } });
  await fakeScan(run.app, 'zhipu');
  await nav.help(run.page);
  expect(urls.filter(u => /humanslive/i.test(u))).toEqual([]);
  expect(run.config.state.hits.length).toBeGreaterThan(0); // remote config came from our GitHub/jsDelivr stand-ins
  expect(vendorState(run.vendors).requests.every(r => !/humanslive/i.test(JSON.stringify(r)))).toBe(true);
  // the shipped code and the files the app wrote
  const shipped = [...filesUnder(path.join(REPO, 'dist')), ...filesUnder(path.join(REPO, 'ui', 'build')), ['remote/config.json', fs.readFileSync(path.join(REPO, 'remote', 'config.json'))] as const];
  for (const [rel, buf] of shipped) expect.soft(/humanslive/i.test(buf.toString('utf8')), rel).toBe(false);
  for (const [rel, buf] of filesUnder(run.sandbox, r => r.startsWith('electron-user-data'))) expect.soft(/humanslive/i.test(buf.toString('utf8')), rel).toBe(false);
});
