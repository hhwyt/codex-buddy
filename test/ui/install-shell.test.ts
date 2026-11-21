// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createApp } from '../../ui/app';
import { autoFirstSwitch } from '../../ui/pages/onboarding';
import { walletOf } from './models-fake';
import { TID } from '../../ui/testids';
import { appState, fakeApi, settle } from './settings.fake';

const get = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
beforeEach(() => { document.body.replaceChildren(); autoFirstSwitch.pending = false; });
afterEach(() => { document.body.replaceChildren(); });

async function mount(fake: ReturnType<typeof fakeApi>) {
  const root = document.createElement('div');
  document.body.append(root);
  return createApp(root, fake.api);
}

test('O-01 首次启动直接显示模型，未安装提示在每页保留，不自动安装', async () => {
  const fake = fakeApi({ 'app:state': appState({ configured: false, codexInstalled: false }) });
  const app = await mount(fake);
  expect(app.route()).toBe('models');
  expect(get(TID.models.root)).not.toBeNull();
  expect(get(TID.onboarding.root)).toBeNull();
  expect(get(TID.onboarding.start)?.textContent).toContain('这台电脑还没装 Codex');
  for (const route of ['settings', 'community', 'models'] as const) {
    await app.go(route);
    expect(get(TID.onboarding.start)?.hidden).toBe(false);
  }
  expect(fake.called('install:run')).toHaveLength(0);
});

test('O-01 提示条只打开一个真实安装抽屉，成功后提示和抽屉一起消失', async () => {
  let installed = false;
  let finish!: (value: { ok: boolean }) => void;
  const fake = fakeApi({
    'app:state': () => appState({ configured: false, codexInstalled: installed }),
    'install:run': () => new Promise(resolve => { finish = resolve; }),
  });
  await mount(fake);
  const banner = get(TID.onboarding.start)!;
  banner.click(); banner.click();
  await settle();
  expect(fake.called('install:run')).toHaveLength(1);
  expect(fake.called('browser:close')).toHaveLength(1);
  expect(get(TID.onboarding.root)?.getAttribute('role')).toBe('dialog');
  fake.emit('step', { flow: 'install', id: 'download', state: 'done', text: '下载好了' });
  expect(get(TID.onboarding.step('download'))?.dataset.state).toBe('done');
  installed = true;
  finish({ ok: true });
  await settle();
  expect(get(TID.onboarding.root)).toBeNull();
  expect(banner.hidden).toBe(true);
  expect(get(TID.models.root)).not.toBeNull();
});

test('O-03 失败保留提示条和进度，重试复用同一个抽屉；帮助入口能离开抽屉', async () => {
  const fake = fakeApi({
    'app:state': appState({ codexInstalled: false }),
    'install:run': { ok: false, reason: '下载失败' },
  });
  await mount(fake);
  get(TID.onboarding.start)!.click();
  await settle();
  expect(get(TID.onboarding.failure)?.textContent).toContain('下载失败');
  expect(get(TID.onboarding.start)?.hidden).toBe(false);
  get(TID.onboarding.retry)!.click();
  await settle();
  expect(fake.called('install:run')).toHaveLength(2);
  get(TID.help)!.click();
  await settle();
  expect(get(TID.onboarding.root)).toBeNull();
  expect(get(TID.community.root)).not.toBeNull();
  expect(get(TID.onboarding.start)?.hidden).toBe(false);
});

test('O-02 检测已安装就不提示，切页重新检测卸载状态', async () => {
  let installed = true;
  const fake = fakeApi({ 'app:state': () => appState({ configured: false, codexInstalled: installed }) });
  const app = await mount(fake);
  expect(get(TID.onboarding.start)?.hidden).toBe(true);
  installed = false;
  await app.go('settings');
  expect(get(TID.onboarding.start)?.hidden).toBe(false);
  expect(fake.called('install:run')).toHaveLength(0);
});


test('M-16 切换时发现 Codex 已卸载，立即显示公共安装入口', async () => {
  let installed = true;
  const fake = fakeApi({
    'app:state': () => appState({ codexInstalled: installed }),
    'wallet:get': walletOf(),
    'switch:start': () => { installed = false; return { ok: false, kind: 'codex-missing', reason: '没找到 Codex' }; },
  });
  await mount(fake);
  expect(get(TID.onboarding.start)?.hidden).toBe(true);
  get(TID.models.card('kimi'))!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  await settle();
  expect(get(TID.onboarding.start)?.hidden).toBe(false);
  expect(get(TID.models.reinstall)).toBeNull();
  get(TID.models.card('deepseek'))!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  await settle();
  expect(fake.called('switch:start')).toHaveLength(1);
});
