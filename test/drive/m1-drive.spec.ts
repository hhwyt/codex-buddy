// M1 drive (build-plan §4 「代理自己驱动 App 核对行为」): the packaged CodexBuddy.app, sandboxed, every external
// address pointed at fake servers. Walks every step the site owner named and saves a screenshot per step to
// docs/screenshots/m1-*.png; docs/m1-behavior-check.md compares them with the plan and the final prototypes.
// Run (Windows): npm run build && npx electron-builder --win dir && set CODEXBUDDY_E2E_EXECUTABLE=release\\win-unpacked\\CodexBuddy.exe &&
//        npx playwright test -c playwright.drive.config.ts   (screenshots: docs/screenshots/win-*.png)
// Run (Mac): npm run dist:mac && CODEXBUDDY_E2E_EXECUTABLE=release/mac-arm64/CodexBuddy.app/Contents/MacOS/CodexBuddy \
//        npx playwright test -c playwright.drive.config.ts
// Safety: CODEXBUDDY_SANDBOX is a fresh temp dir; Codex is a Test-ChatGPT.app installed from a fake dmg into the
// sandbox; the app records every open / reveal / link in <sandbox>/opened.log instead of opening anything.
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { TID } from '../../ui/testids';
import { clickClear, fakeScan, inWebContents, makeCloneOf, nav, switchTo, webContentsUrls } from '../e2e/flows';
import { hashTree } from '../e2e/hash';
import {
  catalogOf, cloneHome, codexDataDir, codexHome, configToml, FAKES, launch, readText, REPO, sandboxApps, seedUserData,
  setCodexScenario, vendorState, wallet, type Launched,
} from '../e2e/launch';

const SHOTS = path.join(REPO, 'docs', 'screenshots');
const REMOTE = JSON.parse(fs.readFileSync(path.join(REPO, 'remote', 'config.json'), 'utf8'));
const WIN = process.platform === 'win32';
/** Screenshot prefix: docs/screenshots/win-*.png from the Windows drive, m1-*.png from the Mac one */
const PREFIX = WIN ? 'win' : 'm1';
const THIRD_PARTY = ['deepseek', 'zhipu', 'kimi', 'qwen', 'minimax', 'hunyuan'] as const;
/** What the drive saw at each step; written next to the screenshots for docs/m1-behavior-check.md */
const seen: { step: string; shot: string; note: string }[] = [];

let run: Launched;
let dmgServer: http.Server;
let dmgUrl = '';

/** A real dmg holding Test-ChatGPT.app (own bundle id, auto-update off, CLI = the fake Codex) */
function buildDmg(dir: string): string {
  const app = path.join(dir, 'src', 'Test-ChatGPT.app');
  fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>local.codexbuddy.test-chatgpt</string>' +
    '<key>CFBundleName</key><string>Test-ChatGPT</string><key>CFBundleExecutable</key><string>ChatGPT</string>' +
    '<key>SUEnableAutomaticChecks</key><false/><key>CFBundleShortVersionString</key><string>26.1.0</string></dict></plist>\n');
  fs.writeFileSync(path.join(app, 'Contents', 'MacOS', 'ChatGPT'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const cli = path.join(app, 'Contents', 'Resources', 'codex-cli', 'CodexCLI.app', 'Contents', 'MacOS');
  fs.mkdirSync(cli, { recursive: true });
  fs.writeFileSync(path.join(cli, 'codex'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(FAKES, 'fake-codex.mjs')}" "$@"\n`, { mode: 0o755 });
  const dmg = path.join(dir, 'Codex.dmg');
  execFileSync('/usr/bin/hdiutil', ['create', '-quiet', '-fs', 'HFS+', '-srcfolder', path.join(dir, 'src'), '-volname', 'Codex', dmg]);
  return dmg;
}

/** The whole window as the user sees it, the native right-side browser included: the page and every visible child
 *  view are captured by Electron and laid out at their bounds (no screen capture, works without a visible desktop) */
async function shot(page: Page, name: string, note: string): Promise<void> {
  const file = path.join(SHOTS, `${PREFIX}-${name}.png`);
  // A window nobody looks at may hand back its last painted frame: ask for a fresh paint and wait two frames
  await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.invalidate());
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  await page.waitForTimeout(120);
  const parts = await run.app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const base = await w.webContents.capturePage();
    const scale = base.getSize().width / Math.max(1, w.getContentBounds().width);
    const out = [{ x: 0, y: 0, url: base.toDataURL() }];
    for (const v of w.contentView.children as unknown as { webContents?: Electron.WebContents; getVisible(): boolean; getBounds(): Electron.Rectangle }[]) {
      if (!v.webContents || v.webContents.id === w.webContents.id || !v.getVisible()) continue;
      const b = v.getBounds();
      if (b.width > 0 && b.height > 0) out.push({ x: b.x * scale, y: b.y * scale, url: (await v.webContents.capturePage()).toDataURL() });
    }
    return out;
  });
  const png = await page.evaluate(async list => {
    const imgs = await Promise.all(list.map(p => new Promise<HTMLImageElement>(r => { const i = new Image(); i.onload = () => r(i); i.src = p.url; })));
    const c = document.createElement('canvas');
    c.width = imgs[0].naturalWidth; c.height = imgs[0].naturalHeight;
    const g = c.getContext('2d')!;
    imgs.forEach((img, i) => g.drawImage(img, list[i].x, list[i].y));
    return c.toDataURL('image/png').split(',')[1];
  }, parts);
  fs.writeFileSync(file, Buffer.from(png, 'base64'));
  seen.push({ step: name, shot: path.relative(REPO, file).split(path.sep).join('/'), note });
}

const models = () => (catalogOf(configToml(run.sandbox)) ?? []).map(m => m.slug).sort();
const remoteSlugs = (v: string) => (REMOTE.models[v] as { slug: string }[]).map(m => m.slug).sort();

test.beforeAll(() => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith(`${PREFIX}-`) && /-\d/.test(f)) fs.rmSync(path.join(SHOTS, f));
});
test.afterAll(async () => {
  fs.writeFileSync(path.join(SHOTS, `${PREFIX}-drive-log.json`), JSON.stringify(seen, null, 2) + '\n');
  await run?.close();
  dmgServer?.close();
});

test('M1 drive: every step on the packaged app', async () => {
  test.setTimeout(20 * 60_000);
  if (WIN) {
    // Windows: the sandbox installer stand-in (CODEXBUDDY_FAKE_INSTALL=ok) writes Test-ChatGPT.app into the sandbox; the
    // real Windows installer (codex.ps1 / Store) never runs in a sandbox
    run = await launch({ env: { CODEXBUDDY_FAKE_INSTALL: 'ok' }, seed: s => seedUserData(s) });
  } else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbuddy-dmg-'));
    const bytes = fs.readFileSync(buildDmg(tmp));
    dmgServer = http.createServer((_q, r) => { r.writeHead(200, { 'Content-Length': bytes.length }); r.end(bytes); });
    await new Promise<void>(r => dmgServer.listen(0, '127.0.0.1', r));
    dmgUrl = `http://127.0.0.1:${(dmgServer.address() as AddressInfo).port}/Codex.dmg`;
    run = await launch({ env: { CODEXBUDDY_FAKE_INSTALL: 'dmg' }, endpoints: { codexDownload: dmgUrl }, seed: s => seedUserData(s) });
  }
  const { page } = run;
  const userData = () => hashTree(codexHome(run.sandbox)) + hashTree(codexDataDir(run.sandbox));

  // 1. 开始安装: the real installer (download → mount → ditto → check) puts Test-ChatGPT.app into the sandbox
  await expect(page.getByTestId(TID.onboarding.start)).toBeVisible();
  await shot(page, '01-welcome', '欢迎屏只有标题和「开始安装」');
  await page.getByTestId(TID.onboarding.start).click();
  await page.waitForTimeout(300);
  await shot(page, '02-installing', '安装进度：下载 Codex / 装进应用程序 / 检查 Codex 一行行打勾');
  await expect(page.getByTestId(TID.models.root)).toBeVisible({ timeout: 60_000 });
  const installed = path.join(sandboxApps(run.sandbox), 'Test-ChatGPT.app');
  expect(fs.existsSync(path.join(installed, 'Contents', 'Info.plist'))).toBe(true);
  expect(readText(path.join(installed, 'Contents', 'Info.plist'))).toContain('local.codexbuddy.test-chatgpt');
  await shot(page, '03-models-first', '装好直接进模型页：7 张卡叠在一起，没有正在用的');

  // 2. First vendor: login page enlarged → scan → key → test → first success dialog
  await page.getByTestId(TID.models.card('deepseek')).click({ position: { x: 60, y: 20 } });
  await expect.poll(() => webContentsUrls(run.app), { timeout: 20_000 }).toContainEqual(expect.stringContaining('/deepseek/login'));
  await page.waitForTimeout(500);
  await shot(page, '04-login-enlarged', '第一次用 DeepSeek：右侧浏览器放大到登录页');
  await fakeScan(run.app, 'deepseek');
  await expect(page.getByTestId(TID.firstSuccess.root)).toBeVisible({ timeout: 30_000 });
  await shot(page, '05-first-success', '第一次成功弹窗：从零到能用 N 秒、打开 Codex、关注行');
  await page.keyboard.press('Escape');
  expect(models()).toEqual(remoteSlugs('deepseek'));
  if (await page.getByTestId(TID.models.tryLater).isVisible().catch(() => false)) {
    await shot(page, '05b-trial', '有赠送额度：「先用着」');
    await page.getByTestId(TID.models.tryLater).click();
  }

  // 3. The other five Chinese vendors one by one: the menu holds only that vendor's models
  let n = 6;
  for (const v of THIRD_PARTY.filter(x => x !== 'deepseek')) {
    await switchTo(run, v);
    expect(models(), v).toEqual(remoteSlugs(v));
    const others = THIRD_PARTY.filter(o => o !== v).flatMap(o => remoteSlugs(o));
    for (const m of models()) expect(others).not.toContain(m);
    await page.waitForTimeout(400);
    await shot(page, `${String(n++).padStart(2, '0')}-switch-${v}`, `切到 ${v}：卡在最上层 ✓ 能用；菜单只有 ${remoteSlugs(v).join(', ')}`);
  }
  // OpenAI official account: the catalog goes away, Codex's own list comes back
  await switchTo(run, 'openai');
  expect(catalogOf(configToml(run.sandbox))).toBeNull();
  await shot(page, `${String(n++).padStart(2, '0')}-switch-openai`, '切回 OpenAI 官方：去掉我们的模型清单');

  // 4. Failure: connection test fails → card shakes back, config byte for byte the same
  await switchTo(run, 'deepseek');
  const toml = configToml(run.sandbox);
  setCodexScenario(run.sandbox, 'unreachable');
  await page.getByTestId(TID.models.card('kimi')).click({ position: { x: 60, y: 20 } });
  await fakeScan(run.app, 'kimi').catch(() => undefined);
  await page.waitForTimeout(250);
  await shot(page, '13-failing', '测不通的那一刻（卡在最上层测试连通）');
  await expect.poll(async () => (await wallet(page)).order[0], { timeout: 30_000 }).toBe('deepseek');
  expect((await wallet(page)).active).toBe('deepseek');
  expect(configToml(run.sandbox)).toBe(toml);
  await shot(page, '14-failed-back', '测不通：卡退回原位，配置逐字节没变，DeepSeek 还是正在用');
  setCodexScenario(run.sandbox, 'ok');
  // A wrong key is said in a dialog (没拿到 Key / 再试一次)
  run.vendors.setScenario('401', 'kimi');
  setCodexScenario(run.sandbox, '401');
  await page.getByTestId(TID.models.card('kimi')).click({ position: { x: 60, y: 20 } });
  await expect(page.getByTestId(TID.dialog.root)).toBeVisible({ timeout: 30_000 });
  await shot(page, '14b-key-failed', 'Key 不对：弹窗写原因，「再试一次」「先不了」');
  await page.getByTestId(TID.dialog.cancel).click();
  expect((await wallet(page)).active).toBe('deepseek');

  // 5. 余额不够 → the recharge page opens enlarged → 再试一次
  run.vendors.setScenario('balance', 'kimi');
  setCodexScenario(run.sandbox, 'balance');
  await page.getByTestId(TID.models.card('kimi')).click({ position: { x: 60, y: 20 } });
  await expect.poll(() => webContentsUrls(run.app), { timeout: 30_000 }).toContainEqual(expect.stringContaining('/kimi/recharge'));
  await page.waitForTimeout(500);
  await shot(page, '15-no-balance', '余额不够：充值页在右侧放大，卡上「去充值」「再试一次」');
  run.vendors.setScenario('ok', 'kimi');
  setCodexScenario(run.sandbox, 'ok');
  await page.getByTestId(TID.browser.close).click();
  await page.getByTestId(TID.models.card('kimi')).getByRole('button', { name: '再试一次' }).click();
  await expect.poll(async () => (await wallet(page)).active, { timeout: 30_000 }).toBe('kimi');
  await shot(page, '16-retry-ok', '充完「再试一次」：Kimi 能用');

  // 6. 被限速 → 换个模型
  run.vendors.setScenario('429', 'qwen');
  setCodexScenario(run.sandbox, '429');
  await page.getByTestId(TID.models.card('qwen')).click({ position: { x: 60, y: 20 } });
  await expect(page.getByTestId(TID.models.rateLimitSwap('qwen'))).toBeVisible({ timeout: 30_000 });
  await shot(page, '17-rate-limited', '被限速：卡上提示，给出「换个模型」');
  run.vendors.setScenario('ok', 'qwen');
  setCodexScenario(run.sandbox, 'ok');
  await page.getByTestId(TID.models.rateLimitSwap('qwen')).click();
  await page.waitForTimeout(300);
  await shot(page, '18-swap-model', '换个模型：提示去 Codex 左下角的模型菜单换');

  // 7. 换 Key on the top card
  await switchTo(run, 'zhipu');
  const keyBefore = (await wallet(page)).cards.find(c => c.vendor === 'zhipu')!.keyTail;
  await page.getByTestId(TID.models.changeKey('zhipu')).click();
  await fakeScan(run.app, 'zhipu').catch(() => undefined);
  await expect.poll(async () => (await wallet(page)).cards.find(c => c.vendor === 'zhipu')!.keyTail, { timeout: 30_000 }).not.toBe(keyBefore);
  await shot(page, '19-change-key', '换 Key：扫码后新 Key 测通才替换（卡号尾号变了）');

  // 8. 去充值 + picture-in-picture: enlarge, shrink, enlarge, close
  await switchTo(run, 'deepseek');
  await page.getByTestId(TID.models.recharge('deepseek')).click();
  await expect.poll(() => webContentsUrls(run.app), { timeout: 20_000 }).toContainEqual(expect.stringContaining('/deepseek/recharge'));
  const paid = await inWebContents(run.app, '/deepseek/recharge', `(() => { let c = false; document.getElementById('fake-pay').addEventListener('click', () => { c = true; }); return new Promise(r => setTimeout(() => r(c), 1000)); })()`);
  expect(paid).toBe(false);
  await shot(page, '20-recharge', '去充值：右侧浏览器放大到官方充值页，App 不替用户点付款');
  await page.getByTestId(TID.browser.shrink).click();
  await expect(page.getByTestId(TID.browser.pip)).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, '21-pip', '缩回画中画：右下角小窗，页面内容留出位置');
  await page.getByTestId(TID.browser.expand).click();
  await expect(page.getByTestId(TID.browser.pip)).toHaveCount(0);
  await page.waitForTimeout(400);
  await shot(page, '22-pip-enlarged', '点画中画放大');
  await page.getByTestId(TID.browser.shrink).click();
  await page.getByTestId(TID.browser.close).click();
  await expect(page.getByTestId(TID.browser.pip)).toHaveCount(0);

  // 9. 分身: spread the cards, make DeepSeek.app, open it, delete it; its data stays byte for byte
  await page.getByTestId(TID.models.modeClone).click();
  await page.waitForTimeout(700);
  await shot(page, '23-clone-spread', '切到分身：卡片摊开，OpenAI 卡是「原来的」，其余「做成分身」');
  await makeCloneOf(run.app, page, 'deepseek');
  const winHome = path.join(run.sandbox, 'home');
  const cloneApp = WIN ? path.join(winHome, 'AppData', 'Local', 'CodexBuddy', 'apps', 'deepseek') : path.join(sandboxApps(run.sandbox), 'DeepSeek.app');
  expect(fs.existsSync(cloneApp)).toBe(true);
  if (WIN) {
    expect(readText(path.join(cloneApp, 'launch.vbs'))).toContain('.codex-deepseek');
    expect(fs.existsSync(path.join(winHome, 'Desktop', 'DeepSeek.lnk'))).toBe(true);
  } else expect(readText(path.join(cloneApp, 'Contents', 'Info.plist'))).toContain('local.codexbuddy.deepseek');
  const cloneMenu = (catalogOf(readText(path.join(cloneHome(run.sandbox, 'deepseek'), 'config.toml'))) ?? []).map(m => m.slug).sort();
  expect(cloneMenu).toEqual(remoteSlugs('deepseek'));
  await shot(page, '24-clone-made', '做成分身：DeepSeek 卡显示「打开」，分身菜单只有 DeepSeek 的模型');
  await page.getByTestId(TID.models.cloneOpen('deepseek')).click();
  await expect.poll(async () => (await run.external()).revealed.join('\n')).toContain(WIN ? cloneApp : 'DeepSeek.app');
  const cloneData = hashTree(cloneHome(run.sandbox, 'deepseek'));
  await page.getByTestId(TID.models.cloneRemove('deepseek')).click();
  await shot(page, '25-clone-remove-confirm', '删除分身先确认，写明聊天记录留着');
  await page.getByTestId(TID.dialog.confirm).click();
  await expect(page.getByTestId(TID.models.cloneMake('deepseek'))).toBeVisible({ timeout: 20_000 });
  expect(fs.existsSync(cloneApp)).toBe(false);
  if (WIN) expect(fs.existsSync(path.join(winHome, 'Desktop', 'DeepSeek.lnk'))).toBe(false);
  expect(hashTree(cloneHome(run.sandbox, 'deepseek'))).toBe(cloneData);
  await shot(page, '26-clone-removed', `删掉分身：只删 ${WIN ? '启动器和 DeepSeek.lnk' : 'DeepSeek.app'}，~/.codex-deepseek 哈希不变`);
  await page.getByTestId(TID.models.modeSwitch).click();
  await page.waitForTimeout(700);
  await shot(page, '27-back-to-switch', '切回切换模式：卡片叠回去');

  // 10. 汉化: line by line into Chinese, back to English (icon stays), trash removes only the launcher
  await nav.settings(page);
  await expect(page.getByTestId(TID.settings.root)).toBeVisible();
  await shot(page, '28-settings', '设置：两张预览图，默认英文原版，没有垃圾桶');
  const zhCard = page.getByTestId(TID.settings.zhCard);
  const settled = () => expect(zhCard).toHaveAttribute('aria-busy', 'false', { timeout: 10_000 });
  await zhCard.click();
  await page.waitForTimeout(650);
  await shot(page, '29-zh-midway', '切汉化版：预览图里的字从上往下一行行变中文（中途）');
  await settled();
  const launcher = WIN
    ? path.join(run.sandbox, 'home', 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'ChatGPT 汉化版.lnk')
    : path.join(sandboxApps(run.sandbox), 'ChatGPT 汉化版.app');
  expect(fs.existsSync(launcher)).toBe(true);
  await shot(page, '30-zh-on', '汉化版：加上「ChatGPT 汉化版」，预览框右下角出现红色垃圾桶');
  await page.getByTestId(TID.settings.enCard).click();
  await page.waitForTimeout(650);
  await shot(page, '31-en-midway', '切回英文原版：字从下往上倒回英文（中途）');
  await settled();
  expect(fs.existsSync(launcher)).toBe(true);
  await shot(page, '32-en-on', '英文原版：汉化版图标留着');
  const before = userData();
  await page.getByTestId(TID.settings.zhTrash).hover();
  await page.waitForTimeout(300);
  await shot(page, '33-trash-hover', '鼠标移上垃圾桶：显示「去掉汉化版」');
  await page.getByTestId(TID.settings.zhTrash).click();
  await page.waitForTimeout(450);
  await shot(page, '34-trash-flying', '图标飞进废纸篓');
  await expect.poll(() => fs.existsSync(launcher), { timeout: 10_000 }).toBe(false);
  await settled();
  expect(userData()).toBe(before);
  await shot(page, '35-trash-done', '去掉汉化版：只删入口，Codex 和聊天记录没动');

  // 11. 安全面板
  await page.getByTestId(TID.shell.security).click();
  await expect(page.getByTestId(TID.security.root)).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, '36-security', `安全面板：Key 只显示后 4 位、${WIN ? '在文件夹里显示' : '在访达里显示'}、去官网管理、两块连过的网站`);
  const text = await page.evaluate(() => document.body.innerText);
  for (const k of Object.values(vendorState(run.vendors).keys).flat()) expect(text).not.toContain(k);
  await page.keyboard.press('Escape');

  // 12. 检查更新 → 更新弹窗
  run.config.setConfig({ ...REMOTE, latest: { ...REMOTE.latest, version: '9.9.9', notes: '新功能' } });
  await clickClear(page.getByTestId(TID.settings.checkUpdate));
  await expect(page.getByTestId(TID.update.root)).toBeVisible({ timeout: 20_000 });
  await shot(page, '37-update', '有新版本：更新弹窗（稍后 / 立即更新）');
  await page.getByTestId(TID.update.later).click();
  await expect(page.getByTestId(TID.update.root)).toHaveCount(0);

  // 13. 一键还原: lists what it will do, keeps chat history, returns to onboarding
  await clickClear(page.getByTestId(TID.settings.restore));
  await expect(page.getByTestId(TID.dialog.root)).toBeVisible();
  await shot(page, '38-restore-confirm', '一键还原：先列出会做的事，最后一行写聊天记录留着（不重复）');
  const sessions = hashTree(path.join(codexHome(run.sandbox), 'sessions'));
  await page.getByTestId(TID.dialog.confirm).click();
  await expect(page.getByTestId(TID.onboarding.root)).toBeVisible({ timeout: 30_000 });
  expect(hashTree(path.join(codexHome(run.sandbox), 'sessions'))).toBe(sessions);
  expect(fs.existsSync(installed)).toBe(false); // this Codex was installed by CodexBuddy, so 还原 uninstalls it
  await shot(page, '39-restored', '还原后回到引导；这次装的 Codex 卸掉，聊天记录留着');
});
