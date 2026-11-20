// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createApp } from '../../ui/app';
import { TID } from '../../ui/testids';
import { appState, fakeApi, settle } from './settings.fake';

const query = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
let root: HTMLElement;
beforeEach(() => { root = document.createElement('div'); document.body.replaceChildren(root); });
afterEach(() => { document.body.replaceChildren(); });

test('N-01 启动先转圈，连接完成前不读取功能数据或显示入口', async () => {
  let finish!: (result: { ok: boolean }) => void;
  const fake = fakeApi({ 'network:check': () => new Promise(resolve => { finish = resolve; }) });
  const started = createApp(root, fake.api);
  await settle(2);
  expect(query(TID.network.loading).textContent).toContain('正在连接');
  expect(query(TID.shell.side)).toBeNull();
  expect(fake.called('app:state')).toHaveLength(0);
  finish({ ok: true });
  const app = await started;
  expect(app.route()).toBe('models');
  expect(query(TID.network.root).hidden).toBe(true);
});

test('N-02 连接失败只显示网络问题、退出和重试，Esc 和背景不能跳过', async () => {
  const fake = fakeApi({ 'network:check': { ok: false } });
  const app = await createApp(root, fake.api);
  expect(query(TID.network.error).textContent).toBe('网络问题请检查网络后重试。退出重试');
  expect(query(TID.shell.side)).toBeNull();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  (root.querySelector('.network-scrim') as HTMLElement).click();
  await app.go('settings');
  expect(app.route()).toBeNull();
  expect(query(TID.network.error)).not.toBeNull();
  expect(fake.called('app:state')).toHaveLength(0);
  query(TID.network.quit).click();
  expect(fake.called('app:quit')).toHaveLength(1);
});

test('N-02 重试重新检测，失败不能进入，成功后才显示功能页', async () => {
  let reachable = false;
  const fake = fakeApi({ 'network:check': () => ({ ok: reachable }) });
  const app = await createApp(root, fake.api);
  query(TID.network.retry).click();
  await settle();
  expect(query(TID.network.error)).not.toBeNull();
  expect(fake.called('network:check')).toHaveLength(2);
  reachable = true;
  query(TID.network.retry).click();
  await settle();
  expect(app.route()).toBe('models');
  expect(query(TID.network.root).hidden).toBe(true);
});

test('N-04 使用中断网隐藏功能页，在线事件本身不能放行，重试后恢复同一页', async () => {
  const fake = fakeApi();
  const app = await createApp(root, fake.api);
  await app.go('settings');
  fake.emit('network', 'offline');
  expect(query(TID.network.root).hidden).toBe(false);
  expect((root.querySelector('.network-content') as HTMLElement).hidden).toBe(true);
  expect(app.route()).toBeNull();
  fake.emit('network', 'online');
  expect(query(TID.network.root).hidden).toBe(false);
  query(TID.network.retry).click();
  await settle();
  expect(app.route()).toBe('settings');
  window.dispatchEvent(new Event('offline'));
  expect(query(TID.network.root).hidden).toBe(false);
  expect(fake.called('network:offline')).toHaveLength(1);
});

test('N-04 后台拒绝读取时锁住界面，重试后只恢复读取，不自动执行修改', async () => {
  let denied = false;
  const fake = fakeApi({
    'app:state': () => denied ? { ok: false, kind: 'network' } : appState(),
  });
  const app = await createApp(root, fake.api);
  denied = true;
  const navigate = app.go('settings');
  await settle(2);
  expect(query(TID.network.error)).not.toBeNull();
  denied = false;
  query(TID.network.retry).click();
  await navigate;
  await settle();
  expect(app.route()).toBe('settings');
  expect(fake.called('zh:set')).toHaveLength(0);
});

test('N-02 检测异常也显示同一报错，Tab 焦点只能在退出和重试之间移动', async () => {
  const fake = fakeApi({ 'network:check': () => { throw new Error('internal'); } });
  await createApp(root, fake.api);
  expect(query(TID.network.error).textContent).not.toContain('internal');
  expect(document.activeElement).toBe(query(TID.network.quit));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  expect(document.activeElement).toBe(query(TID.network.retry));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  expect(document.activeElement).toBe(query(TID.network.quit));
});
