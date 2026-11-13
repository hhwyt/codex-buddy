// Settings T-01..T-04, 汉化 L-01..L-07 (language-final.html), updates U-01..U-04, help H-01..H-02. Owner: A7.
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TID } from '../../ui/testids';
import { clickClear, finishOnboarding, makeCloneOf, nav, switchTo, webContentsUrls } from './flows';
import { hashTree } from './hash';
import {
  appState, codexHome, configToml, launch, readText, REPO, sandboxApps, seedCodex, seedUserData, setCodexRunning, wallet, type Launched,
} from './launch';
import { BASE_NEEDS, merge, needs } from './pending';

let run: Launched;
needs(merge(BASE_NEEDS, { ui: { settings: ['TID.settings.zhCard', 'TID.settings.zhTrash', 'TID.settings.checkUpdate', 'TID.settings.restore'], help: ['TID.help.explain'], update: ['TID.update.later'] }, ipc: ['zh:set', 'zh:remove', 'update:check', 'update:dismiss', 'update:install', 'restore:plan', 'restore:run', 'help:explain'] }));
test.afterEach(async () => { await run?.close(); });

const REMOTE = JSON.parse(fs.readFileSync(path.join(REPO, 'remote', 'config.json'), 'utf8'));
const withRemote = (patch: Record<string, unknown>) => ({ ...REMOTE, ...patch });

async function ready(env: Record<string, string> = {}, clones: string[] = []): Promise<Launched> {
  run = await launch({ env, seed: s => { seedCodex(s); seedUserData(s, clones); } });
  await finishOnboarding(run.page);
  return run;
}
const zhLauncher = () => process.platform === 'win32'
  ? path.join(run.home, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'ChatGPT 汉化版.lnk')
  : path.join(sandboxApps(run.sandbox), 'ChatGPT 汉化版.app');
const chatgptApp = () => path.join(sandboxApps(run.sandbox), 'Test-ChatGPT.app');
const cjk = (s: string) => (s.match(/[一-鿿]/g) ?? []).length;
const toSettings = async () => { await nav.settings(run.page); await expect(run.page.getByTestId(TID.settings.root)).toBeVisible(); };
const zhOn = async () => (await appState(run.page)).zh.on;
/** The previews ignore clicks while the line-by-line animation runs (language-final.html); wait for it to finish */
const settled = () => expect(run.page.getByTestId(TID.settings.zhCard)).toHaveAttribute('aria-busy', 'false', { timeout: 10_000 });
const langMsg = () => run.page.getByTestId(TID.settings.langMsg);

// ---------- 汉化 L ----------

test('L-01 默认英文原版，安装时不问', async () => {
  run = await launch({ seed: s => seedCodex(s) });
  await run.page.getByTestId(TID.onboarding.start).click();
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible({ timeout: 30_000 });
  await expect(run.page.getByTestId(TID.dialog.root)).toHaveCount(0); // nothing asked during install
  expect(await zhOn()).toBe(false);
  expect(fs.existsSync(zhLauncher())).toBe(false);
  await toSettings();
  await expect(run.page.getByTestId(TID.settings.enCard)).toHaveAttribute('aria-checked', 'true');
  await expect(run.page.getByTestId(TID.settings.zhTrash)).toHaveCount(0);
});

test('L-02 点汉化版，预览图逐行变中文，第一次加上汉化版图标，ChatGPT.app 不变', async () => {
  await ready();
  const app = hashTree(chatgptApp());
  await toSettings();
  const preview = run.page.getByTestId(TID.settings.zhCard);
  const start = cjk(await preview.innerText());
  const samples: number[] = [];
  await preview.click();
  for (let i = 0; i < 20; i++) { samples.push(cjk(await preview.innerText())); await run.page.waitForTimeout(80); }
  await expect.poll(zhOn, { timeout: 10_000 }).toBe(true);
  const end = cjk(await preview.innerText());
  // The clicked preview starts over from English (language-final.html), then flips into Chinese line by line:
  // at least one sample sits strictly between the all-English start and the Chinese end
  const low = Math.min(start, ...samples);
  expect(end).toBeGreaterThan(low);
  expect(samples.some(n => n > low && n < end)).toBe(true);
  expect(fs.existsSync(zhLauncher())).toBe(true);
  expect(hashTree(chatgptApp())).toBe(app);
  await expect(run.page.getByTestId(TID.settings.zhCard)).toHaveAttribute('aria-checked', 'true');
});

test('L-03 点英文原版字倒回英文，汉化版图标留着', async () => {
  await ready();
  await toSettings();
  await run.page.getByTestId(TID.settings.zhCard).click();
  await expect.poll(zhOn).toBe(true);
  await settled();
  const zhText = cjk(await run.page.getByTestId(TID.settings.zhCard).innerText());
  await run.page.getByTestId(TID.settings.enCard).click();
  await expect.poll(zhOn).toBe(false);
  await settled();
  // The English preview turns back into English (bottom to top); the 汉化版 preview keeps showing Chinese
  await expect(run.page.getByTestId(TID.settings.enCard)).toContainText('New chat');
  expect(cjk(await run.page.getByTestId(TID.settings.zhCard).innerText())).toBeGreaterThanOrEqual(zhText - 5);
  expect(fs.existsSync(zhLauncher())).toBe(true);
  await expect(run.page.getByTestId(TID.settings.zhTrash)).toBeVisible();
  await expect(run.page.getByTestId(TID.settings.enCard)).toHaveAttribute('aria-checked', 'true');
});

test('L-04 垃圾桶只在汉化版加上后出现，在预览框右下角不配文字，点了只删入口', async () => {
  await ready();
  await toSettings();
  const trash = run.page.getByTestId(TID.settings.zhTrash);
  await expect(trash).toHaveCount(0);
  await run.page.getByTestId(TID.settings.zhCard).click();
  await expect(trash).toBeVisible({ timeout: 10_000 });
  const card = (await run.page.getByTestId(TID.settings.zhCard).boundingBox())!;
  const t = (await trash.boundingBox())!;
  // inside the zh preview frame, bottom right quarter
  expect(t.x).toBeGreaterThanOrEqual(card.x);
  expect(t.x + t.width).toBeLessThanOrEqual(card.x + card.width + 1);
  expect(t.y + t.height).toBeLessThanOrEqual(card.y + card.height + 1);
  expect(t.x + t.width / 2).toBeGreaterThan(card.x + card.width / 2);
  expect(t.y + t.height / 2).toBeGreaterThan(card.y + card.height / 2);
  // no words on the button itself; 去掉汉化版 is only the hover tip
  expect(await trash.evaluate(e => { const c = e.cloneNode(true) as HTMLElement; c.querySelectorAll('.tip').forEach(t => t.remove()); return (c.textContent ?? '').trim(); })).toBe('');
  expect(await trash.getAttribute('title') ?? await trash.getAttribute('aria-label')).toBe('去掉汉化版');
  // the English card never has one
  await expect(run.page.getByTestId(TID.settings.enCard).getByTestId(TID.settings.zhTrash)).toHaveCount(0);
  const data = hashTree(codexHome(run.sandbox));
  const app = hashTree(chatgptApp());
  await trash.click();
  await expect.poll(() => fs.existsSync(zhLauncher()), { timeout: 10_000 }).toBe(false);
  await expect(trash).toHaveCount(0);
  expect(hashTree(codexHome(run.sandbox))).toBe(data);
  expect(hashTree(chatgptApp())).toBe(app);
});

test('L-05 只有 Codex 正开着时才问要不要重新打开', async () => {
  await ready();
  await toSettings();
  await run.page.getByTestId(TID.settings.zhCard).click();
  await expect.poll(zhOn).toBe(true);
  await settled();
  await expect(langMsg()).not.toContainText('重新打开');
  setCodexRunning(run.sandbox, true);
  await run.page.getByTestId(TID.settings.enCard).click();
  // language-final.html asks on the line under the previews: 重新打开 / 先不了
  await expect(langMsg()).toContainText('重新打开', { timeout: 10_000 });
  await langMsg().getByRole('button', { name: '先不了' }).click();
  await expect(langMsg()).not.toContainText('重新打开');
  expect(fs.existsSync(path.join(run.sandbox, 'fake-codex-running'))).toBe(true); // never closes Codex itself
});

test('L-06 这一版 Codex 汉化不了时退回英文，Codex 照常能用', async () => {
  await ready({ CODEXBUDDY_FAKE_ZH: 'unsupported' });
  await toSettings();
  await run.page.getByTestId(TID.settings.zhCard).click();
  await expect(langMsg()).toContainText('汉化不了', { timeout: 10_000 });
  expect(await zhOn()).toBe(false);
  await expect(run.page.getByTestId(TID.settings.enCard)).toHaveAttribute('aria-checked', 'true');
  await nav.models(run.page);
  await switchTo(run, 'deepseek');
});

test('L-07 分身跟着汉化开关走', async () => {
  await ready();
  await run.page.getByTestId(TID.models.modeClone).click();
  await makeCloneOf(run.app, run.page, 'deepseek');
  const appsDir = process.platform === 'win32' ? path.join(run.home, 'AppData', 'Local', 'CodexBuddy', 'apps') : sandboxApps(run.sandbox);
  const cloneApp = () => fs.readdirSync(appsDir).find(n => n.startsWith('DeepSeek'))!;
  const english = hashTree(path.join(appsDir, cloneApp()));
  await toSettings();
  await run.page.getByTestId(TID.settings.zhCard).click();
  await expect.poll(zhOn).toBe(true);
  await settled();
  await expect.poll(() => hashTree(path.join(appsDir, cloneApp()))).not.toBe(english); // its launcher now opens in Chinese
  await run.page.getByTestId(TID.settings.enCard).click();
  await expect.poll(zhOn).toBe(false);
  await settled();
  await expect.poll(() => hashTree(path.join(appsDir, cloneApp()))).toBe(english);
});

// ---------- 设置 T ----------

test('T-01 汉化版和英文原版切换，失败时提示', async () => {
  await ready();
  await toSettings();
  await run.page.getByTestId(TID.settings.zhCard).click();
  await expect.poll(zhOn).toBe(true);
  await settled();
  await run.page.getByTestId(TID.settings.enCard).click();
  await expect.poll(zhOn).toBe(false);
  await settled();
  // failure path: the 汉化版 entry cannot be added (its folder is a file), the page says so and stays English
  fs.rmSync(zhLauncher(), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(zhLauncher()), { recursive: true });
  fs.writeFileSync(zhLauncher(), 'occupied');
  fs.chmodSync(zhLauncher(), 0o444);
  await run.page.getByTestId(TID.settings.zhCard).click();
  await expect(langMsg()).toContainText('✗', { timeout: 10_000 });
  expect(await zhOn()).toBe(false);
});

test('T-02 检查更新：有新版本、已是最新、断网三种情况', async () => {
  await ready();
  await toSettings();
  await run.page.getByTestId(TID.settings.checkUpdate).click();
  await expect(run.page.getByTestId(TID.toast)).toContainText('最新');
  run.config.setConfig(withRemote({ latest: { ...REMOTE.latest, version: '9.9.9', notes: '修了一些问题' } }));
  await run.page.getByTestId(TID.settings.checkUpdate).click();
  await expect(run.page.getByTestId(TID.update.root)).toBeVisible();
  await expect(run.page.getByTestId(TID.update.root)).toContainText('9.9.9');
  await run.page.getByTestId(TID.update.later).click();
  run.config.setMode('jsdelivr', 'down');
  run.config.setMode('github', 'down');
  await run.page.getByTestId(TID.settings.checkUpdate).click();
  const toast = run.page.getByTestId(TID.toast);
  await expect(toast).toBeVisible();
  await expect(toast).not.toContainText('最新');
});

test('T-03 一键还原先列出会做的事，先不了就什么都不做', async () => {
  await ready();
  await switchTo(run, 'deepseek');
  const toml = configToml(run.sandbox);
  const w = await wallet(run.page);
  await toSettings();
  await clickClear(run.page.getByTestId(TID.settings.restore));
  const dlg = run.page.getByTestId(TID.dialog.root);
  await expect(dlg).toBeVisible();
  const plan = await run.page.evaluate(() => (window as unknown as { buddy: { invoke(c: string): Promise<{ lines: string[] }> } }).buddy.invoke('restore:plan'));
  expect(plan.lines.length).toBeGreaterThan(0);
  for (const line of plan.lines) await expect(dlg).toContainText(line);
  await expect(dlg).toContainText('聊天记录');
  await run.page.getByTestId(TID.dialog.cancel).click();
  await expect(dlg).toBeHidden();
  expect(configToml(run.sandbox)).toBe(toml);
  expect(await wallet(run.page)).toEqual(w);
});

test('T-04 还原后配置恢复原样，原来就有的 Codex 不卸，聊天记录保留，回到引导', async () => {
  await ready();
  const original = configToml(run.sandbox);
  const sessions = hashTree(path.join(codexHome(run.sandbox), 'sessions'));
  await switchTo(run, 'zhipu');
  expect(configToml(run.sandbox)).not.toBe(original);
  await toSettings();
  await clickClear(run.page.getByTestId(TID.settings.restore));
  await run.page.getByTestId(TID.dialog.confirm).click();
  await expect(run.page.getByTestId(TID.onboarding.root)).toBeVisible({ timeout: 30_000 });
  expect(configToml(run.sandbox)).toBe(original);
  expect(fs.existsSync(chatgptApp())).toBe(true);
  expect(hashTree(path.join(codexHome(run.sandbox), 'sessions'))).toBe(sessions);
  const cookies = await run.app.evaluate(async ({ session }) => {
    const all = await Promise.all([session.defaultSession, ...['persist:browser', 'persist:codexbuddy-browser'].map(p => session.fromPartition(p))].map(s => s.cookies.get({})));
    return all.flat().filter(c => c.name === 'fake_login').length;
  });
  expect(cookies).toBe(0);
});

test('T-04 还原时卸掉这次装的 Codex', async () => {
  run = await launch({ seed: s => seedUserData(s) });
  await finishOnboarding(run.page);
  expect(fs.existsSync(chatgptApp())).toBe(true);
  await toSettings();
  await clickClear(run.page.getByTestId(TID.settings.restore));
  await run.page.getByTestId(TID.dialog.confirm).click();
  await expect(run.page.getByTestId(TID.onboarding.root)).toBeVisible({ timeout: 30_000 });
  expect(fs.existsSync(chatgptApp())).toBe(false);
  expect(readText(path.join(codexHome(run.sandbox), 'history.jsonl'))).not.toBeNull();
});

// ---------- 更新 U ----------

test('U-01 有新版本时弹窗，稍后后同一个版本一天内不再弹', async () => {
  run = await launch({ seed: s => { seedCodex(s); seedUserData(s); } });
  run.config.setConfig(withRemote({ latest: { ...REMOTE.latest, version: '9.9.9', notes: '新功能' } }));
  run = await run.relaunch();
  const dlg = run.page.getByTestId(TID.update.root);
  await expect(dlg).toBeVisible({ timeout: 20_000 });
  await run.page.getByTestId(TID.update.later).click();
  await expect(dlg).toBeHidden();
  run = await run.relaunch();
  await run.page.waitForTimeout(3000);
  await expect(run.page.getByTestId(TID.update.root)).toHaveCount(0);
});

test('U-02 立即更新显示进度并重启，模型、Key、设置都保留', async () => {
  test.skip(process.platform === 'darwin', 'Mac 没签名时走 U-03（打开下载页）');
  await ready();
  await switchTo(run, 'deepseek');
  const before = await wallet(run.page);
  run.config.setConfig(withRemote({ latest: { ...REMOTE.latest, version: '9.9.9' } }));
  await toSettings();
  await run.page.getByTestId(TID.settings.checkUpdate).click();
  await run.page.getByTestId(TID.update.now).click();
  await expect(run.page.getByTestId(TID.update.progress)).toBeVisible();
  run = await run.relaunch();
  const after = await wallet(run.page);
  expect(after.active).toBe(before.active);
  expect(after.cards.find(c => c.vendor === 'deepseek')!.keyTail).toBe(before.cards.find(c => c.vendor === 'deepseek')!.keyTail);
});

test('U-03 Mac 没签名时立即更新改成在右侧浏览器打开下载页', async () => {
  test.skip(process.platform !== 'darwin', '只在 Mac');
  await ready();
  run.config.setConfig(withRemote({ latest: { ...REMOTE.latest, version: '9.9.9' } }));
  await toSettings();
  await run.page.getByTestId(TID.settings.checkUpdate).click();
  await run.page.getByTestId(TID.update.now).click();
  await expect.poll(async () => [...await webContentsUrls(run.app), ...(await run.external()).opened].join('\n'), { timeout: 20_000 })
    .toContain(REMOTE.latest.macUrl.replace('https://', ''));
});

test('U-04 远程开关能隐藏某张卡或汉化入口', async () => {
  run = await launch({ seed: s => { seedCodex(s); seedUserData(s); } });
  run.config.setConfig(withRemote({ switches: { hiddenVendors: ['minimax'], hideZh: true, hideClone: false } }));
  run = await run.relaunch();
  await finishOnboarding(run.page);
  await expect(run.page.getByTestId(TID.models.card('minimax'))).toHaveCount(0);
  await expect(run.page.getByTestId(TID.models.card('deepseek'))).toBeVisible();
  await toSettings();
  await expect(run.page.getByTestId(TID.settings.zhCard)).toHaveCount(0);
  expect((await appState(run.page)).zh.hidden).toBe(true);
});

// ---------- 帮助 H ----------

test('H-01 粘贴报错出解读，知道了', async () => {
  await ready();
  await nav.help(run.page);
  await run.page.getByTestId(TID.help.errorInput).fill('ERROR: unexpected status 401 Unauthorized: invalid api key');
  await run.page.getByTestId(TID.help.explain).click();
  const out = run.page.getByTestId(TID.help.explanation);
  await expect(out).toBeVisible();
  expect(cjk(await out.innerText())).toBeGreaterThan(4);
  await run.page.getByTestId(TID.help.gotIt).click();
  await expect(out).toBeHidden();
});

test('H-02 社群码在线显示最新的，断网显示上次的，从没取到写连上网后显示', async () => {
  // never fetched: both sources down from the first start
  run = await launch({ seed: s => seedCodex(s) });
  run.config.setMode('jsdelivr', 'down');
  run.config.setMode('github', 'down');
  run = await run.relaunch();
  await finishOnboarding(run.page);
  await nav.help(run.page);
  await expect(run.page.getByTestId(TID.help.community)).toContainText('连上网后显示');
  // online: the latest code
  run.config.setMode('jsdelivr', 'ok');
  run.config.setMode('github', 'ok');
  run.config.setConfig(withRemote({ community: { qrUrl: 'https://raw.githubusercontent.com/hhwyt/codex-buddy/main/remote/qr-v2.png', text: '扫码进群 第二版' } }));
  run = await run.relaunch();
  await nav.help(run.page);
  await expect(run.page.getByTestId(TID.help.community)).toContainText('第二版');
  // offline again: the last one seen
  run.config.setMode('jsdelivr', 'down');
  run.config.setMode('github', 'down');
  run = await run.relaunch();
  await nav.help(run.page);
  await expect(run.page.getByTestId(TID.help.community)).toContainText('第二版');
});
