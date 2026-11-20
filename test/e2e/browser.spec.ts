// Right-side browser B-01..B-07 (approved-spec §3 右侧浏览器 B, PRD §3.6 with picture-in-picture). Owner: A7.
// The browser is a main-process webContents; its state reaches the page as the `browser` event (IPC contract).
import { expect, test } from '@playwright/test';
import { TID } from '../../ui/testids';
import { fakeScan, finishOnboarding, inWebContents, nav, switchTo, webContentsUrls } from './flows';
import { launch, seedConfigured, seedCodex, seedUserData, setCodexScenario, vendorState, type Launched } from './launch';
import { BASE_NEEDS, merge, needs } from './pending';

let run: Launched;
needs(merge(BASE_NEEDS, { ui: { models: [] }, ipc: ['browser:show', 'browser:close', 'browser:back', 'browser:reload'] }));
test.afterEach(async () => { await run?.close(); });

async function ready(): Promise<Launched> {
  run = await launch({ seed: s => { seedCodex(s); seedUserData(s); seedConfigured(s); } });
  await finishOnboarding(run.page);
  await run.page.evaluate(() => {
    const w = window as unknown as { __browser?: unknown[]; buddy: { on(e: string, fn: (p: unknown) => void): void } };
    w.__browser = []; w.buddy.on('browser', b => w.__browser!.push(b));
  });
  return run;
}
type BrowserState = { open: boolean; mode: 'pip' | 'expanded'; url: string; canGoBack: boolean };
const events = () => run.page.evaluate(() => (window as unknown as { __browser: BrowserState[] }).__browser);
const last = async () => (await events()).at(-1);
const windowWidth = () => run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().width);
const screenWidth = () => run.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workAreaSize.width);

test('B-01 后台自动操作时显示画中画在右下角；拿到 Key 后马上关掉（页面上会露出整个 Key）', async () => {
  await ready();
  setCodexScenario(run.sandbox, 'timeout');
  await run.page.getByTestId(TID.models.card('zhipu')).click({ position: { x: 60, y: 45 } });
  // The PiP shows only while the key is made in the background: record where the page drew it the moment it appears
  await run.page.evaluate(testid => {
    const w = window as unknown as { pipSeen?: { x: number; y: number; vw: number; vh: number } };
    new MutationObserver((_m, obs) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      w.pipSeen = { x: r.x + r.width / 2, y: r.y + r.height / 2, vw: innerWidth, vh: innerHeight };
      obs.disconnect();
    }).observe(document.body, { childList: true, subtree: true });
  }, TID.browser.pip);
  await fakeScan(run.app, 'zhipu'); // after the scan the key is made in the background
  await expect.poll(async () => (await events()).some(e => e.open && e.mode === 'pip'), { timeout: 30_000 }).toBe(true);
  const seen = await run.page.evaluate(() => (window as unknown as { pipSeen?: { x: number; y: number; vw: number; vh: number } }).pipSeen);
  expect(seen).toBeTruthy();
  expect(seen!.x).toBeGreaterThan(seen!.vw / 2);
  expect(seen!.y).toBeGreaterThan(seen!.vh / 2);
  await expect.poll(async () => (await events()).at(-1)?.open, { timeout: 30_000 }).toBe(false);
  await expect(run.page.getByTestId(TID.browser.pip)).toBeHidden();
});

test('B-02 要扫码时自动放大，窗口宽度够就加宽约 480px，屏幕不够宽时盖住右半边', async () => {
  await ready();
  const before = await windowWidth();
  await run.page.getByTestId(TID.models.card('kimi')).click({ position: { x: 60, y: 45 } });
  await expect.poll(async () => (await last())?.mode, { timeout: 20_000 }).toBe('expanded');
  const after = await windowWidth();
  // ~480px; a screen just short of that (1440 wide: 980 + 460) still widens by what fits, at least 400px
  if (before + 400 <= await screenWidth()) {
    expect(after - before).toBeGreaterThanOrEqual(400);
    expect(after - before).toBeLessThanOrEqual(480);
    expect(after).toBeLessThanOrEqual(await screenWidth());
  } else {
    expect(after).toBeLessThanOrEqual(await screenWidth()); // covers the right half instead of growing off screen
  }
});

test('B-03 点画中画或地球按钮就放大，放大后能缩回画中画', async () => {
  await ready();
  await run.page.getByTestId(TID.shell.browser).click();
  await expect.poll(async () => (await last())?.mode).toBe('expanded');
  await run.page.getByTestId(TID.browser.shrink).click();
  await expect.poll(async () => (await last())?.mode).toBe('pip');
  await run.page.getByTestId(TID.browser.pip).click();
  await expect.poll(async () => (await last())?.mode).toBe('expanded');
});

test('B-04 只有点关闭才关，在模型设置社群之间切换时不动', async () => {
  await ready();
  await run.page.getByTestId(TID.shell.browser).click();
  await expect.poll(async () => (await last())?.open).toBe(true);
  const n = (await events()).length;
  await nav.settings(run.page);
  await nav.community(run.page);
  await nav.models(run.page);
  await run.page.waitForTimeout(300);
  expect((await events()).slice(n).every(e => e.open)).toBe(true);
  await expect(run.page.getByTestId(TID.browser.close)).toBeVisible();
  await run.page.getByTestId(TID.browser.close).click();
  await expect.poll(async () => (await last())?.open).toBe(false);
});

test('B-05 地址栏只读，后退和刷新可用', async () => {
  await ready();
  await run.page.getByTestId(TID.models.card('zhipu')).click({ position: { x: 60, y: 45 } });
  await inWebContents(run.app, '/zhipu/login', 'true');
  const address = run.page.getByTestId(TID.browser.address);
  await expect.poll(() => address.evaluate(el => (el as HTMLInputElement).value ?? el.textContent ?? '')).toContain('/zhipu/login');
  const readOnly = await address.evaluate(el => (el as HTMLInputElement).readOnly === true || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !(el as HTMLElement).isContentEditable));
  expect(readOnly).toBe(true);
  await inWebContents(run.app, '/zhipu/login', `location.href = location.href.replace('/login', '/keys'); true`);
  await expect.poll(async () => (await last())?.url ?? '').toContain('/zhipu/keys');
  await run.page.getByTestId(TID.browser.back).click();
  await expect.poll(async () => (await last())?.url ?? '').toContain('/zhipu/login');
  const hits = vendorState(run.vendors).requests.filter(r => r.path === '/login').length;
  await run.page.getByTestId(TID.browser.reload).click();
  await expect.poll(() => vendorState(run.vendors).requests.filter(r => r.path === '/login').length).toBeGreaterThan(hits);
});

test('B-06 App 启动时浏览器是关着的，不记住上次的状态', async () => {
  await ready();
  await run.page.getByTestId(TID.shell.browser).click();
  await switchTo(run, 'deepseek');
  run = await run.relaunch();
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible();
  await expect(run.page.getByTestId(TID.browser.pip)).toHaveCount(0);
  await expect(run.page.getByTestId(TID.browser.close)).toHaveCount(0);
  const urls = await webContentsUrls(run.app);
  expect(urls.filter(u => u.startsWith('http'))).toEqual([]);
});

test('B-07 浏览器的登录数据单独存，不碰用户的 Chrome', async () => {
  await ready();
  await run.page.getByTestId(TID.models.card('zhipu')).click({ position: { x: 60, y: 45 } });
  await inWebContents(run.app, '/zhipu/login', 'true');
  const info = await run.app.evaluate(({ webContents, session }) => {
    const wc = webContents.getAllWebContents().find(w => w.getURL().includes('/zhipu/login'))!;
    return { own: wc.session !== session.defaultSession, storage: wc.session.getStoragePath(), persistent: wc.session.isPersistent() };
  });
  expect(info.own).toBe(true);
  expect(info.persistent).toBe(true);
  expect(info.storage).toContain(run.sandbox);
  expect(info.storage).not.toMatch(/Google[\\/]Chrome/);
});
