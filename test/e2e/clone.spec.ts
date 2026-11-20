// 分身 C-01..C-10 (approved-spec §3 分身 C), the spread-out cards of model-page-final.html. Owner: A7.
// Sandbox: clones land in <sandbox>/Applications (Mac: <Name>.app) or the sandbox launcher folder (Windows), their
// data in <sandbox>/home/.codex-<slug>. Opening goes through shell.openPath / openExternal, captured (seam 6).
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TID } from '../../ui/testids';
import { cardBoxes, clickClear, finishOnboarding, makeCloneOf, nav, switchTo } from './flows';
import { hashTree } from './hash';
import {
  catalogOf, cloneHome, codexHome, launch, readText, seedConfigured, seedCodex, seedUserData, setCodexRunning, VENDOR_IDS, wallet, type Launched,
} from './launch';
import { BASE_NEEDS, merge, needs } from './pending';

let run: Launched;
needs(merge(BASE_NEEDS, { ui: { models: ['TID.models.modeClone', 'TID.models.cloneMake(', 'TID.models.cloneOpen(', 'TID.models.cloneRemove('], settings: ['TID.settings.restore'] }, ipc: ['wallet:mode', 'clone:make', 'clone:open', 'clone:remove', 'restore:run'] }));
test.afterEach(async () => { await run?.close(); });

async function ready(): Promise<Launched> {
  run = await launch({ seed: s => { seedCodex(s); seedUserData(s); seedConfigured(s); } });
  await finishOnboarding(run.page);
  return run;
}
const appsDir = () => process.platform === 'win32'
  ? path.join(run.home, 'AppData', 'Local', 'CodexBuddy', 'apps') : path.join(run.sandbox, 'Applications');
/** The clone's app (Mac .app) or launcher (Windows) for a display name, or null */
const cloneEntry = (name: string) => {
  const dir = appsDir();
  // Windows launcher folders are named by slug (deepseek), Mac apps by display name (DeepSeek.app)
  const hit = fs.existsSync(dir) ? fs.readdirSync(dir).find(n => n === `${name}.app` || n.startsWith(`${name}.`) || n.toLowerCase() === name.toLowerCase()) : undefined;
  return hit ? path.join(dir, hit) : null;
};
const plist = (app: string) => readText(path.join(app, 'Contents', 'Info.plist')) ?? '';
const plistValue = (xml: string, key: string) => new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1] ?? null;

async function toCloneMode() {
  await run.page.getByTestId(TID.models.modeClone).click();
  await expect.poll(async () => (await wallet(run.page)).mode).toBe('clone');
}
async function makeClone(v: string) {
  await makeCloneOf(run.app, run.page, v);
}

test('C-01 分身模式下点做成分身生成独立 App', async () => {
  await ready();
  await toCloneMode();
  for (const v of VENDOR_IDS.filter(x => x !== 'openai')) await expect(run.page.getByTestId(TID.models.cloneMake(v))).toBeVisible();
  await makeClone('deepseek');
  expect(cloneEntry('DeepSeek')).not.toBeNull();
  expect((await wallet(run.page)).cards.find(c => c.vendor === 'deepseek')!.cloneMade).toBe(true);
});

test('C-02 做好的卡显示打开，点了打开那个分身', async () => {
  await ready();
  await toCloneMode();
  await makeClone('deepseek');
  await expect(run.page.getByTestId(TID.models.cloneMake('deepseek'))).toHaveCount(0);
  await run.page.getByTestId(TID.models.cloneOpen('deepseek')).click();
  await expect.poll(async () => { const e = await run.external(); return [...e.opened, ...e.revealed].join('\n').toLowerCase(); }, { timeout: 10_000 })
    .toContain('deepseek');
});

test('C-03 分身和原来的 Codex 能同时开', async () => {
  await ready();
  setCodexRunning(run.sandbox, true);
  await toCloneMode();
  await makeClone('kimi');
  await run.page.getByTestId(TID.models.cloneOpen('kimi')).click();
  await expect.poll(async () => { const e = await run.external(); return [...e.opened, ...e.revealed].join('\n').toLowerCase(); }).toContain('kimi');
  // Here only: nobody closed the original, and the clone has an identity of its own. That two real Codex windows run side
  // by side is checked on a real machine only (spike d, docs/m1-behavior-check.md)
  expect(fs.existsSync(path.join(run.sandbox, 'fake-codex-running'))).toBe(true);
  const app = cloneEntry('Kimi')!;
  if (app.endsWith('.app')) expect(plistValue(plist(app), 'CFBundleIdentifier')).not.toBe('com.openai.codex');
  else {
    const lnks = [path.join(run.home, 'Desktop', 'Kimi.lnk'), path.join(run.home, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Kimi.lnk')];
    for (const lnk of lnks) {
      const link = await run.app.evaluate(({ shell }, file) => shell.readShortcutLink(file), lnk);
      expect(link.appUserModelId).toBe('CodexBuddy.Kimi');
      expect(link.appUserModelId).not.toMatch(/^OpenAI\.Codex_/);
    }
  }
  await expect(run.page.getByTestId(TID.toast)).not.toContainText('关掉');
});

test('C-04 分身的聊天记录和设置各自独立', async () => {
  await ready();
  const main = hashTree(codexHome(run.sandbox));
  await toCloneMode();
  await makeClone('deepseek');
  expect(hashTree(codexHome(run.sandbox))).toBe(main);
  expect(readText(path.join(cloneHome(run.sandbox, 'deepseek'), 'config.toml'))).not.toBeNull();
  expect(path.resolve(cloneHome(run.sandbox, 'deepseek'))).not.toBe(path.resolve(codexHome(run.sandbox)));
});

test('C-05 分身的名字和图标是厂商自己的', async () => {
  await ready();
  await toCloneMode();
  await makeClone('deepseek');
  const app = cloneEntry('DeepSeek')!;
  expect(path.basename(app)).toMatch(/^DeepSeek/i);
  if (app.endsWith('.app')) {
    const xml = plist(app);
    expect(plistValue(xml, 'CFBundleName') ?? plistValue(xml, 'CFBundleDisplayName')).toBe('DeepSeek');
    const icon = plistValue(xml, 'CFBundleIconFile');
    expect(icon).toBeTruthy();
    const iconFile = path.join(app, 'Contents', 'Resources', icon!.endsWith('.icns') ? icon! : `${icon}.icns`);
    expect(fs.existsSync(iconFile)).toBe(true);
  }
  await expect(run.page.getByTestId(TID.models.card('deepseek'))).toHaveScreenshot('clone-card-deepseek.png', { maxDiffPixelRatio: 0.02 });
});

test('C-06 分身的模型菜单里只有它这一家的模型', async () => {
  await ready();
  await toCloneMode();
  await makeClone('kimi');
  const cat = catalogOf(readText(path.join(cloneHome(run.sandbox, 'kimi'), 'config.toml')));
  expect(cat).not.toBeNull();
  const remote = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'remote', 'config.json'), 'utf8')) as { models: Record<string, { slug: string }[]> };
  expect(cat!.map(m => m.slug).sort()).toEqual(remote.models.kimi.map(m => m.slug).sort());
});

test('C-07 删除分身先确认，只删 App，数据目录留着', async () => {
  run = await launch({ seed: s => { seedCodex(s); seedUserData(s, ['deepseek']); seedConfigured(s); } });
  await finishOnboarding(run.page);
  await toCloneMode();
  await makeClone('deepseek');
  const data = hashTree(cloneHome(run.sandbox, 'deepseek'));
  await run.page.getByTestId(TID.models.cloneRemove('deepseek')).click();
  await expect(run.page.getByTestId(TID.dialog.root)).toBeVisible();
  expect(cloneEntry('DeepSeek')).not.toBeNull(); // nothing removed before the confirm
  await run.page.getByTestId(TID.dialog.confirm).click();
  await expect(run.page.getByTestId(TID.models.cloneMake('deepseek'))).toBeVisible({ timeout: 20_000 });
  expect(cloneEntry('DeepSeek')).toBeNull();
  expect(hashTree(cloneHome(run.sandbox, 'deepseek'))).toBe(data);
});

test('C-08 再做同名分身时自动接上原来的聊天记录', async () => {
  run = await launch({ seed: s => { seedCodex(s); seedUserData(s, ['deepseek']); seedConfigured(s); } });
  await finishOnboarding(run.page);
  const sessions = path.join(cloneHome(run.sandbox, 'deepseek'), 'sessions');
  const before = hashTree(sessions);
  await toCloneMode();
  await makeClone('deepseek');
  await run.page.getByTestId(TID.models.cloneRemove('deepseek')).click();
  await run.page.getByTestId(TID.dialog.confirm).click();
  await makeClone('deepseek');
  expect(hashTree(sessions)).toBe(before);
  expect(cloneEntry('DeepSeek')).not.toBeNull();
});

test('C-09 切换和分身来回切：卡片叠起或摊开，切换模式的状态不变', async () => {
  await ready();
  await switchTo(run, 'deepseek');
  const stacked = await wallet(run.page);
  const pile = await cardBoxes(run.page, [...VENDOR_IDS]);
  await toCloneMode();
  await run.page.waitForTimeout(800); // the spread animation
  const spread = await cardBoxes(run.page, [...VENDOR_IDS]);
  // stacked: one column; spread: several columns
  expect(new Set(Object.values(pile).map(b => Math.round(b.x))).size).toBe(1);
  expect(new Set(Object.values(spread).map(b => Math.round(b.x))).size).toBeGreaterThan(1);
  await run.page.getByTestId(TID.models.modeSwitch).click();
  await expect.poll(async () => (await wallet(run.page)).mode).toBe('switch');
  await run.page.waitForTimeout(800);
  const back = await wallet(run.page);
  expect(back.active).toBe(stacked.active);
  expect(back.order).toEqual(stacked.order);
  const again = await cardBoxes(run.page, [...VENDOR_IDS]);
  // the pile is laid out as before (relative to its top card; the page itself may have scrolled a pixel)
  const top = back.order[0];
  for (const v of VENDOR_IDS) expect(Math.round(again[v].y - again[top].y)).toBe(Math.round(pile[v].y - pile[top].y));
});

test('C-10 一键还原时分身 App 一起去掉，数据目录留着', async () => {
  run = await launch({ seed: s => { seedCodex(s); seedUserData(s, ['kimi']); seedConfigured(s); } });
  await finishOnboarding(run.page);
  await toCloneMode();
  await makeClone('kimi');
  const data = hashTree(path.join(cloneHome(run.sandbox, 'kimi'), 'sessions'));
  await nav.settings(run.page);
  await clickClear(run.page.getByTestId(TID.settings.restore));
  await run.page.getByTestId(TID.dialog.confirm).click();
  await expect(run.page.getByTestId(TID.onboarding.root)).toBeVisible({ timeout: 30_000 });
  expect(cloneEntry('Kimi')).toBeNull();
  expect(hashTree(path.join(cloneHome(run.sandbox, 'kimi'), 'sessions'))).toBe(data);
});
