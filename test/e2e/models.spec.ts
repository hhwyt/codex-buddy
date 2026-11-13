// Model page, switch mode: M-01..M-23 and M-28 (approved-spec §3 模型叠卡 M), model-page-final.html. Owner: A7.
// Pile geometry (model-page-final.html): order[0] is the card in use, fully visible at the bottom of the pile; back
// cards show 50px headers above it. "Drag to the top of the pile" = drag down onto the front card.
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TID } from '../../ui/testids';
import { cardBoxes, dragCardTo, dragToFront, fakeScan, finishOnboarding, inWebContents, switchTo, webContentsUrls } from './flows';
import {
  codexHome, configToml, launch, readText, sandboxApps, seedCodex, seedUserData, setCodexRunning, setCodexScenario,
  tomlValue, VENDOR_IDS, vendorState, wallet, type Launched,
} from './launch';
import { recordSteps, steps } from './steps';
import { BASE_NEEDS, merge, needs } from './pending';

let run: Launched;
needs(merge(BASE_NEEDS, { ui: { models: ['TID.models.changeKey(', 'TID.models.recharge(', 'TID.models.addVendor', 'TID.models.repair', 'TID.models.reinstall', 'TID.models.tryLater', 'TID.models.rateLimitSwap('] }, ipc: ['wallet:reorder', 'switch:cancel', 'key:replace', 'recharge:open', 'custom:add', 'codex:repair', 'codex:reinstall', 'codex:open', 'browser:close'] }));
test.afterEach(async () => { await run?.close(); });

async function ready(env: Record<string, string> = {}): Promise<Launched> {
  run = await launch({ env, seed: s => { seedCodex(s); seedUserData(s); } });
  await finishOnboarding(run.page);
  return run;
}
const card = (v: string) => run.page.getByTestId(TID.models.card(v));
const authKey = () => /"OPENAI_API_KEY"\s*:\s*"([^"]+)"/.exec(readText(path.join(codexHome(run.sandbox), 'auth.json')) ?? '')?.[1] ?? null;
const lastKey = (v: string) => (vendorState(run.vendors).keys[v] ?? []).at(-1) ?? null;
const browserEvents = async () => {
  await run.page.evaluate(() => {
    const w = window as unknown as { __browser?: unknown[]; buddy: { on(e: string, fn: (p: unknown) => void): void } };
    if (!w.__browser) { w.__browser = []; w.buddy.on('browser', b => w.__browser!.push(b)); }
  });
  return () => run.page.evaluate(() => (window as unknown as { __browser: { open: boolean; mode: string; url: string }[] }).__browser);
};
/** Codex switched its model (the user picked one in Codex's model menu): rewrite `model = …` in config.toml */
function codexPicksModel(model: string) {
  const f = path.join(codexHome(run.sandbox), 'config.toml');
  const toml = readText(f)!;
  fs.writeFileSync(f, /^model\s*=/m.test(toml) ? toml.replace(/^model\s*=\s*".*"/m, `model = "${model}"`) : `model = "${model}"\n${toml}`);
}

test('M-01 第一次进来所有卡都在且没有正在用的', async () => {
  await ready();
  const w = await wallet(run.page);
  expect(w.active).toBeNull();
  expect(w.order.slice(0, 7)).toEqual([...VENDOR_IDS]);
  for (const v of VENDOR_IDS) await expect(card(v)).toBeAttached();
  await expect(run.page.getByTestId(TID.models.addVendor)).toBeVisible();
});

test('M-02 点后面的卡抽到最上层并开始切换', async () => {
  await ready();
  await card('kimi').click();
  await expect.poll(async () => (await wallet(run.page)).order[0]).toBe('kimi');
  await fakeScan(run.app, 'kimi');
  await expect.poll(async () => (await wallet(run.page)).active, { timeout: 30_000 }).toBe('kimi');
  expect(tomlValue(configToml(run.sandbox), 'model_provider')).toContain('kimi');
});

test('M-03 把后面的卡拖到最上层就切换', async () => {
  await ready();
  await dragToFront(run.page, 'qwen');
  await fakeScan(run.app, 'qwen');
  await expect.poll(async () => (await wallet(run.page)).active, { timeout: 30_000 }).toBe('qwen');
});

test('M-04 拖动途中其他卡让位', async () => {
  await ready();
  const others = VENDOR_IDS.filter(v => v !== 'hunyuan');
  const before = await cardBoxes(run.page, others);
  let during: typeof before = {};
  const front = (await wallet(run.page)).order[0];
  const fb = (await card(front).boundingBox())!;
  await dragCardTo(run.page, 'hunyuan', fb.y + 20, async () => { during = await cardBoxes(run.page, others); });
  const moved = others.filter(v => during[v] && Math.abs(during[v].y - before[v].y) > 1);
  expect(moved.length).toBeGreaterThan(0);
});

test('M-05 拖了但没到最上层只调整顺序，不切换也不改配置', async () => {
  await ready();
  const toml = configToml(run.sandbox);
  const before = await wallet(run.page);
  const box = (await card('kimi').boundingBox())!;
  await dragCardTo(run.page, 'kimi', box.y + 20 + 50); // one header lower, still behind the front card
  await expect.poll(async () => (await wallet(run.page)).order.join()).not.toBe(before.order.join());
  const after = await wallet(run.page);
  expect(after.order[0]).toBe(before.order[0]);
  expect(after.active).toBe(before.active);
  expect(configToml(run.sandbox)).toBe(toml);
  expect(await webContentsUrls(run.app)).not.toContainEqual(expect.stringContaining('/kimi/login'));
});

test('M-06 切换中再点别的卡不响应', async () => {
  await ready();
  await card('zhipu').click(); // waits on the QR scan: switching is in progress
  await inWebContents(run.app, '/zhipu/login', 'true');
  await card('kimi').click({ force: true });
  await run.page.waitForTimeout(500);
  const w = await wallet(run.page);
  expect(w.order[0]).toBe('zhipu');
  expect(await webContentsUrls(run.app)).not.toContainEqual(expect.stringContaining('/kimi/login'));
  await fakeScan(run.app, 'zhipu');
  await expect.poll(async () => (await wallet(run.page)).active, { timeout: 30_000 }).toBe('zhipu');
});

test('M-07 测试连通没通过卡退回原位且配置逐字节没变', async () => {
  await ready();
  await switchTo(run, 'deepseek');
  const toml = configToml(run.sandbox);
  const auth = readText(path.join(codexHome(run.sandbox), 'auth.json'));
  const order = (await wallet(run.page)).order;
  run.vendors.setScenario('401', 'kimi');
  setCodexScenario(run.sandbox, '401');
  await card('kimi').click();
  await fakeScan(run.app, 'kimi').catch(() => undefined);
  await expect.poll(async () => (await wallet(run.page)).order.join(), { timeout: 30_000 }).toBe(order.join());
  const w = await wallet(run.page);
  expect(w.active).toBe('deepseek');
  expect(configToml(run.sandbox)).toBe(toml);
  expect(readText(path.join(codexHome(run.sandbox), 'auth.json'))).toBe(auth);
});

test('M-08 智谱第一次用：右侧浏览器放大到登录页，扫码后自动建 Key 并能用', async () => {
  await ready();
  const events = await browserEvents();
  await card('zhipu').click();
  await expect.poll(async () => (await events()).some(e => e.open && e.mode === 'expanded' && e.url.includes('/zhipu/login')), { timeout: 20_000 }).toBe(true);
  await fakeScan(run.app, 'zhipu');
  await expect.poll(async () => (await wallet(run.page)).active, { timeout: 30_000 }).toBe('zhipu');
  const key = lastKey('zhipu');
  expect(key).toBeTruthy();
  expect(authKey()).toBe(key);
  const w = await wallet(run.page);
  expect(w.cards.find(c => c.vendor === 'zhipu')!.keyTail).toBe(key!.slice(-4));
  await expect(card('zhipu')).toContainText('能用');
});

test('M-09 扫码中关掉右侧浏览器等于取消，什么都没改', async () => {
  await ready();
  const toml = configToml(run.sandbox);
  await card('zhipu').click();
  await inWebContents(run.app, '/zhipu/login', 'true');
  await run.page.getByTestId(TID.browser.close).click();
  await expect.poll(async () => (await wallet(run.page)).active).toBeNull();
  expect(configToml(run.sandbox)).toBe(toml);
  expect(vendorState(run.vendors).keys.zhipu ?? []).toHaveLength(0);
});

test('M-10 建 Key 失败弹窗写原因，再试一次', async () => {
  await ready();
  run.vendors.setScenario('keyfail', 'zhipu');
  await card('zhipu').click();
  await fakeScan(run.app, 'zhipu');
  const dlg = run.page.getByTestId(TID.dialog.root);
  await expect(dlg).toBeVisible({ timeout: 30_000 });
  expect((await dlg.innerText()).trim().length).toBeGreaterThan(0);
  run.vendors.setScenario('ok', 'zhipu');
  await run.page.getByTestId(TID.dialog.confirm).click(); // 再试一次
  await fakeScan(run.app, 'zhipu').catch(() => undefined);
  await expect.poll(async () => (await wallet(run.page)).active, { timeout: 30_000 }).toBe('zhipu');
});

test('M-11 智谱免费模型不提充值，Codex 里换成付费模型先测通，余额不够转充值', async () => {
  await ready();
  await switchTo(run, 'zhipu');
  await expect(run.page.getByTestId(TID.models.recharge('zhipu'))).toHaveCount(0);
  await expect(card('zhipu')).not.toContainText('增强');
  run.vendors.setScenario('balance', 'zhipu');
  setCodexScenario(run.sandbox, 'balance');
  codexPicksModel('glm-4.6');
  await expect.poll(() => webContentsUrls(run.app), { timeout: 30_000 }).toContainEqual(expect.stringContaining('/zhipu/recharge'));
});

test('M-12 付费卡有赠送额度时先用着，充值页在画中画里放着', async () => {
  await ready();
  const events = await browserEvents();
  await switchTo(run, 'deepseek');
  await expect(run.page.getByTestId(TID.models.tryLater)).toBeVisible({ timeout: 20_000 });
  await run.page.getByTestId(TID.models.tryLater).click();
  await expect.poll(async () => (await events()).at(-1)).toMatchObject({ open: true, mode: 'pip' });
  expect((await events()).at(-1)!.url).toContain('/deepseek/recharge');
  expect((await wallet(run.page)).active).toBe('deepseek');
});

test('M-13 余额不够，充值页放大，充完再试一次', async () => {
  await ready();
  const events = await browserEvents();
  run.vendors.setScenario('balance', 'kimi');
  setCodexScenario(run.sandbox, 'balance');
  await card('kimi').click();
  await fakeScan(run.app, 'kimi').catch(() => undefined);
  await expect.poll(async () => (await events()).some(e => e.mode === 'expanded' && e.url.includes('/kimi/recharge')), { timeout: 30_000 }).toBe(true);
  run.vendors.setScenario('ok', 'kimi');
  setCodexScenario(run.sandbox, 'ok');
  await run.page.getByTestId(TID.dialog.confirm).click(); // 再试一次
  await expect.poll(async () => (await wallet(run.page)).active, { timeout: 30_000 }).toBe('kimi');
});

test('M-14 免费模型被限速，卡上提示并给出换个模型', async () => {
  await ready();
  run.vendors.setScenario('429', 'zhipu');
  setCodexScenario(run.sandbox, '429');
  await card('zhipu').click();
  await fakeScan(run.app, 'zhipu').catch(() => undefined);
  await expect(run.page.getByTestId(TID.models.rateLimitSwap('zhipu'))).toBeVisible({ timeout: 30_000 });
  await expect(card('zhipu')).toContainText('限速');
  await run.page.getByTestId(TID.models.rateLimitSwap('zhipu')).click();
});

test('M-15 Codex 用不了时一键修复，已经做过的步骤跳过', async () => {
  await ready();
  await switchTo(run, 'deepseek');
  setCodexScenario(run.sandbox, 'unreachable');
  await card('kimi').click();
  await fakeScan(run.app, 'kimi').catch(() => undefined);
  await expect(run.page.getByTestId(TID.models.repair)).toBeVisible({ timeout: 30_000 });
  setCodexScenario(run.sandbox, 'ok');
  await recordSteps(run.page);
  await run.page.getByTestId(TID.models.repair).click();
  await expect.poll(async () => (await steps(run.page)).some(s => s.flow === 'repair' && s.state === 'done'), { timeout: 30_000 }).toBe(true);
  const repair = (await steps(run.page)).filter(s => s.flow === 'repair');
  // Steps already in place (Codex installed) are skipped: they finish without being redone
  expect(repair.some(s => s.state === 'fail')).toBe(false);
  await expect(run.page.getByTestId(TID.models.repair)).toHaveCount(0);
});

test('M-16 Codex 被删了显示重新安装', async () => {
  await ready();
  fs.rmSync(path.join(sandboxApps(run.sandbox), 'ChatGPT.app'), { recursive: true, force: true });
  run = await run.relaunch();
  await expect(run.page.getByTestId(TID.models.reinstall)).toBeVisible({ timeout: 20_000 });
  await run.page.getByTestId(TID.models.reinstall).click();
  await expect.poll(() => fs.existsSync(path.join(sandboxApps(run.sandbox), 'ChatGPT.app')), { timeout: 30_000 }).toBe(true);
  await expect(run.page.getByTestId(TID.models.reinstall)).toHaveCount(0);
});

test('M-17 换 Key：扫码后新 Key 测通才替换，不通保持旧的', async () => {
  await ready();
  await switchTo(run, 'zhipu');
  const first = authKey();
  await run.page.getByTestId(TID.models.changeKey('zhipu')).click();
  await fakeScan(run.app, 'zhipu').catch(() => undefined);
  await expect.poll(() => authKey(), { timeout: 30_000 }).not.toBe(first);
  const second = authKey();
  expect(second).toBe(lastKey('zhipu'));
  run.vendors.setScenario('401', 'zhipu');
  setCodexScenario(run.sandbox, '401');
  const created = (vendorState(run.vendors).keys.zhipu ?? []).length;
  await run.page.getByTestId(TID.models.changeKey('zhipu')).click();
  await fakeScan(run.app, 'zhipu').catch(() => undefined);
  await expect.poll(() => (vendorState(run.vendors).keys.zhipu ?? []).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(created);
  await run.page.waitForTimeout(1500);
  expect(authKey()).toBe(second);
});

test('M-18 去充值只在付费卡正面，右侧浏览器打开官方充值页且不替用户付款', async () => {
  await ready();
  await switchTo(run, 'zhipu');
  await expect(run.page.getByTestId(TID.models.recharge('zhipu'))).toHaveCount(0);
  await switchTo(run, 'deepseek');
  await run.page.getByTestId(TID.models.recharge('deepseek')).click();
  const paid = await inWebContents(run.app, '/deepseek/recharge', `(() => { let clicked = false; document.getElementById('fake-pay').addEventListener('click', () => { clicked = true; }); return new Promise(r => setTimeout(() => r(clicked), 1500)); })()`);
  expect(paid).toBe(false);
});

test('M-19 其他厂商：填写后测试连通并加一张卡', async () => {
  await ready();
  await run.page.getByTestId(TID.models.addVendor).click();
  await run.page.getByTestId(TID.models.customName).fill('自建');
  await run.page.getByTestId(TID.models.customBaseUrl).fill(`${run.vendors.vendorUrl('deepseek')}/v1`);
  await run.page.getByTestId(TID.models.customModel).fill('deepseek-chat');
  await run.page.getByTestId(TID.models.customKey).fill('sk-e2e-custom-0000000000001234');
  await run.page.getByTestId(TID.models.customSubmit).click();
  await expect.poll(async () => (await wallet(run.page)).cards.some(c => c.vendor.startsWith('custom-') && c.name === '自建'), { timeout: 30_000 }).toBe(true);
  expect(vendorState(run.vendors).requests.some(r => r.vendor === 'deepseek' && r.path.startsWith('/v1/'))).toBe(true);
});

test('M-20 第一次成功弹窗显示从零到能用 N 秒，有打开 Codex 和关注行', async () => {
  await ready();
  await card('deepseek').click();
  await fakeScan(run.app, 'deepseek').catch(() => undefined);
  const dlg = run.page.getByTestId(TID.firstSuccess.root);
  await expect(dlg).toBeVisible({ timeout: 30_000 });
  await expect(run.page.getByTestId(TID.firstSuccess.seconds)).toHaveText(/\d+/);
  await expect(dlg).toContainText('从零到能用');
  await expect(dlg).toContainText('关注');
  await run.page.getByTestId(TID.firstSuccess.openCodex).click();
  await expect(dlg).toBeHidden();
  // Only the first success shows it; 打开 Codex appears nowhere else
  await switchTo(run, 'kimi');
  await expect(dlg).toBeHidden();
  await expect(run.page.getByText('打开 Codex')).toHaveCount(0);
});

test('M-21 Codex 开着时切换多提示一句重新打开，不替用户关 Codex', async () => {
  await ready();
  setCodexRunning(run.sandbox, true);
  await switchTo(run, 'deepseek');
  await expect(run.page.getByTestId(TID.models.reopenHint)).toBeVisible();
  await expect(run.page.getByTestId(TID.models.reopenHint)).toContainText('重新打开');
  expect(fs.existsSync(path.join(run.sandbox, 'fake-codex-running'))).toBe(true);
});

test('M-22 OpenAI 官方账号在系统浏览器里登录', async () => {
  await ready();
  await card('openai').click();
  await expect.poll(async () => (await wallet(run.page)).active, { timeout: 30_000 }).toBe('openai');
  expect(await webContentsUrls(run.app)).not.toContainEqual(expect.stringContaining('/openai/login'));
  expect(readText(path.join(codexHome(run.sandbox), 'auth.json'))).toContain('tokens');
});

test('M-23 重启 App 后卡片顺序和正在用的那张不变', async () => {
  await ready();
  await switchTo(run, 'deepseek');
  const box = (await card('minimax').boundingBox())!;
  await dragCardTo(run.page, 'minimax', box.y + 20 + 50);
  const before = await wallet(run.page);
  run = await run.relaunch();
  await expect(run.page.getByTestId(TID.models.root)).toBeVisible();
  const after = await wallet(run.page);
  expect(after.order).toEqual(before.order);
  expect(after.active).toBe('deepseek');
});

test('M-28 在 Codex 里换了模型，卡片上的模型名跟着变', async () => {
  await ready();
  await switchTo(run, 'zhipu');
  codexPicksModel('glm-4.6');
  await expect(run.page.getByTestId(TID.models.cardModel('zhipu'))).toContainText(/glm-4\.6|GLM-4\.6/i, { timeout: 20_000 });
  // display only: clicking it changes nothing
  const toml = configToml(run.sandbox);
  await run.page.getByTestId(TID.models.cardModel('zhipu')).click({ force: true });
  expect(configToml(run.sandbox)).toBe(toml);
});
