// Security panel S-01..S-08 (approved-spec §3 安全 S). Owner: A7.
import { expect, test } from '@playwright/test';
import * as path from 'node:path';
import { TID } from '../../ui/testids';
import { fakeScan, finishOnboarding, inWebContents, switchTo, webContentsUrls } from './flows';
import { clipboard, filesUnder, launch, seedCodex, seedUserData, vendorState, wallet, type Launched } from './launch';
import type { ConnectionView } from '../../electron/main/ipc-contract';
import { BASE_NEEDS, merge, needs } from './pending';

let run: Launched;
needs(merge(BASE_NEEDS, { ui: { security: ['TID.security.key(', 'TID.security.reveal(', 'TID.security.manage(', 'TID.security.askAi', 'TID.security.source'] }, ipc: ['security:get', 'security:reveal', 'security:manage', 'security:ask-ai', 'security:source'] }));
let output = '';
test.afterEach(async () => { await run?.close(); });

async function ready(): Promise<Launched> {
  run = await launch({ seed: s => { seedCodex(s); seedUserData(s); } });
  output = '';
  run.app.process().stdout?.on('data', d => { output += String(d); });
  run.app.process().stderr?.on('data', d => { output += String(d); });
  await finishOnboarding(run.page);
  return run;
}
const openPanel = async () => {
  await run.page.getByTestId(TID.shell.security).click();
  await expect(run.page.getByTestId(TID.security.root)).toBeVisible();
};
const allKeys = () => Object.values(vendorState(run.vendors).keys).flat();
const vendorHost = () => new URL(run.vendors.url).host;

test('S-01 盾牌打开面板，Key 列表里的 Key 已打码', async () => {
  await ready();
  await switchTo(run, 'deepseek');
  await openPanel();
  const row = run.page.getByTestId(TID.security.key('deepseek'));
  await expect(row).toBeVisible();
  const key = vendorState(run.vendors).keys.deepseek.at(-1)!;
  await expect(row).toContainText(key.slice(-4));
  expect(await row.innerText()).not.toContain(key);
});

test('S-02 在访达或文件夹里显示 Key 文件', async () => {
  await ready();
  await switchTo(run, 'deepseek');
  await openPanel();
  await run.page.getByTestId(TID.security.reveal('deepseek')).click();
  await expect.poll(async () => (await run.external()).revealed.length).toBeGreaterThan(0);
  const shown = (await run.external()).revealed.at(-1)!;
  expect(path.resolve(shown).startsWith(path.resolve(run.sandbox))).toBe(true);
});

test('S-03 去官网管理在右侧浏览器打开官方 Key 管理页', async () => {
  await ready();
  await switchTo(run, 'deepseek');
  await openPanel();
  await run.page.getByTestId(TID.security.manage('deepseek')).click();
  await expect.poll(() => webContentsUrls(run.app)).toContainEqual(expect.stringContaining('/deepseek/keys'));
});

test('S-04 连过的网站实时更新，分 CodexBuddy 连过的和网页里连过的', async () => {
  await ready();
  await openPanel();
  const appSites = run.page.getByTestId(TID.security.appSites);
  const webSites = run.page.getByTestId(TID.security.webSites);
  await expect(appSites).toBeVisible();
  await expect(webSites).toBeVisible();
  await run.page.getByTestId(TID.security.close).click();
  // DeepSeek: the key is made in the web page (网页里连过的); CodexBuddy itself then asks DeepSeek for the balance
  await run.page.getByTestId(TID.models.card('deepseek')).click({ position: { x: 60, y: 45 } });
  await fakeScan(run.app, 'deepseek');
  await expect.poll(async () => (await wallet(run.page)).active, { timeout: 30_000 }).toBe('deepseek');
  await run.page.keyboard.press('Escape'); // first-success dialog
  await openPanel();
  // panel stays open while more connections happen: it updates live
  await expect(webSites).toContainText(vendorHost(), { timeout: 20_000 });
  await expect(appSites).toContainText(vendorHost(), { timeout: 30_000 });
  const got = await run.page.evaluate(() => (window as unknown as { buddy: { invoke(c: string): Promise<{ app: ConnectionView[]; web: ConnectionView[] }> } }).buddy.invoke('security:get'));
  expect(got.app.length).toBeGreaterThan(0);
  expect(got.web.length).toBeGreaterThan(0);
});

test('S-05 白名单外的请求被拦掉并记下来', async () => {
  await ready();
  // CodexBuddy's own session asks for a host outside the whitelist (web pages are only logged, never blocked: S-04)
  const reached = await run.app.evaluate(async ({ session }) => session.defaultSession.fetch('http://203.0.113.9/steal').then(() => true, () => false));
  expect(reached).toBe(false);
  await openPanel();
  await expect.poll(async () => {
    const got = await run.page.evaluate(() => (window as unknown as { buddy: { invoke(c: string): Promise<{ app: ConnectionView[]; web: ConnectionView[] }> } }).buddy.invoke('security:get'));
    return [...got.app, ...got.web].find(c => c.host.startsWith('203.0.113.9'));
  }, { timeout: 20_000 }).toMatchObject({ allowed: false });
});

test('S-06 让 AI 帮我检查复制出写好的提问', async () => {
  await ready();
  await openPanel();
  await run.page.getByTestId(TID.security.askAi).click();
  await expect.poll(() => clipboard(run.app)).not.toBe('');
  const text = await clipboard(run.app);
  expect(text.length).toBeGreaterThan(20);
  expect(text).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/);
});

test('S-07 查看源代码', async () => {
  await ready();
  await openPanel();
  await run.page.getByTestId(TID.security.source).click();
  await expect.poll(async () => [...(await run.external()).opened, ...(await webContentsUrls(run.app))].join('\n')).toContain('github.com/hhwyt/codex-buddy');
});

test('S-08 日志和界面里任何地方都不出现完整的 Key', async () => {
  await ready();
  await switchTo(run, 'deepseek');
  await switchTo(run, 'zhipu');
  await run.page.getByTestId(TID.models.changeKey('zhipu')).click();
  await fakeScan(run.app, 'zhipu').catch(() => undefined);
  await run.page.getByTestId(TID.restart.later).click();
  await openPanel();
  await run.page.getByTestId(TID.security.askAi).click();
  const keys = allKeys();
  expect(keys.length).toBeGreaterThan(0);
  const html = await run.page.content();
  const clip = await clipboard(run.app);
  const log = await run.page.evaluate(() => (window as unknown as { buddy: { invoke(c: string): Promise<{ text: string }> } }).buddy.invoke('install:log'));
  // Every file CodexBuddy wrote, except where Codex itself must read the key and the browser's own profile
  const files = filesUnder(run.sandbox, rel => /(^|[\\/])\.codex[^\\/]*[\\/]auth\.json$/.test(rel) || rel.startsWith('electron-user-data') || /Partitions/.test(rel));
  for (const k of keys) {
    expect(html, 'page').not.toContain(k);
    expect(clip, 'clipboard').not.toContain(k);
    expect(log.text ?? '', 'install log').not.toContain(k);
    expect(output, 'main process output').not.toContain(k);
    for (const [rel, buf] of files) expect(buf.includes(k), rel).toBe(false);
  }
});
