// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp } from '../../ui/app';
import { NETWORK_RETRY_MS } from '../../ui/components/network';
import { BUNDLED_QR } from '../../ui/pages/community';
import { TID } from '../../ui/testids';
import { appState, fakeApi, settle } from './settings.fake';

const query = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
let root: HTMLElement;
beforeEach(() => { root = document.createElement('div'); document.body.replaceChildren(root); localStorage.clear(); });
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

test('N-01 打开直接显示平常界面，没有「正在连接」页；检查在后台进行', async () => {
  let finish!: (result: { ok: boolean }) => void;
  const fake = fakeApi({ 'network:check': () => new Promise(resolve => { finish = resolve; }) });
  const started = createApp(root, fake.api);
  await settle(4);
  expect(query(TID.shell.side)).not.toBeNull();
  expect(fake.called('app:state').length).toBeGreaterThan(0);
  expect(query(TID.network.root).hidden).toBe(true);
  expect(root.textContent).not.toContain('正在连接');
  finish({ ok: true });
  const app = await started;
  expect(app.route()).toBe('models');
  expect(query(TID.network.root).hidden).toBe(true);
});

test('N-02 启动检查失败在当前界面上弹网络问题，后面的界面点不了；Esc 和背景不能跳过', async () => {
  const fake = fakeApi({ 'network:check': { ok: false } });
  const app = await createApp(root, fake.api);
  expect(query(TID.network.error).textContent).toBe('网络问题请检查网络后重试。去社群咨询重试');
  expect(query(TID.shell.side)).not.toBeNull();
  expect((root.querySelector('.network-content') as HTMLElement).inert).toBe(true);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  (root.querySelector('.network-scrim') as HTMLElement).click();
  await app.go('settings');
  expect(app.route()).toBeNull();
  expect(query(TID.network.error)).not.toBeNull();
  expect(query(TID.network.quit)).toBeNull();
});

test('N-02 点去社群咨询进入社群页，网络锁暂时收起；点其他导航弹窗回来', async () => {
  const fake = fakeApi({ 'network:check': { ok: false }, 'install:log': { text: '普通日志' } });
  await createApp(root, fake.api);
  const button = query(TID.help);
  expect(button.textContent).toBe('去社群咨询');
  button.click();
  await settle();
  expect(query(TID.community.root)).not.toBeNull();
  expect(query(TID.community.qr).getAttribute('src')).toBe(BUNDLED_QR);
  expect(query(TID.network.root).hidden).toBe(true);
  expect((root.querySelector('.network-content') as HTMLElement).inert).toBe(false);
  query(TID.shell.navSettings).click();
  await settle();
  expect(query(TID.network.root).hidden).toBe(false);
  expect((root.querySelector('.network-content') as HTMLElement).inert).toBe(true);
});

test('N-02 重试时按钮转圈；失败弹窗留着，成功弹窗收起、回到原来的页', async () => {
  let reachable = false;
  let answer!: (r: { ok: boolean }) => void;
  const fake = fakeApi({ 'network:check': () => (fake.called('network:check').length === 1 ? { ok: false } : new Promise(resolve => { answer = resolve; })) });
  const app = await createApp(root, fake.api);
  query(TID.network.retry).click();
  const retry = query(TID.network.retry) as HTMLButtonElement;
  expect(retry.disabled).toBe(true);
  expect(retry.querySelector('.network-retry-spin')).not.toBeNull();
  answer({ ok: reachable });
  await settle();
  expect(query(TID.network.error)).not.toBeNull();
  expect((query(TID.network.retry) as HTMLButtonElement).disabled).toBe(false);
  reachable = true;
  query(TID.network.retry).click();
  answer({ ok: reachable });
  await settle();
  expect(query(TID.network.root).hidden).toBe(true);
  expect((root.querySelector('.network-content') as HTMLElement).inert).toBe(false);
  expect(app.route()).toBe('models');
});

test('N-04 弹窗在时每 3 秒自动再查，查通了弹窗自己收起', async () => {
  vi.useFakeTimers();
  let reachable = false;
  const fake = fakeApi({ 'network:check': () => ({ ok: reachable }) });
  await createApp(root, fake.api);
  expect(query(TID.network.error)).not.toBeNull();
  await vi.advanceTimersByTimeAsync(NETWORK_RETRY_MS);
  expect(fake.called('network:check')).toHaveLength(2);
  expect(query(TID.network.error)).not.toBeNull();
  reachable = true;
  await vi.advanceTimersByTimeAsync(NETWORK_RETRY_MS);
  expect(query(TID.network.root).hidden).toBe(true);
  await vi.advanceTimersByTimeAsync(NETWORK_RETRY_MS * 3);
  expect(fake.called('network:check')).toHaveLength(3);
});

test('N-04 启动检查通过后，用到一半断网不弹窗、不锁界面', async () => {
  const fake = fakeApi();
  const app = await createApp(root, fake.api);
  await app.go('settings');
  fake.emit('network', 'offline');
  window.dispatchEvent(new Event('offline'));
  expect(query(TID.network.root).hidden).toBe(true);
  expect((root.querySelector('.network-content') as HTMLElement).inert).toBe(false);
  expect(app.route()).toBe('settings');
  expect(fake.called('network:check')).toHaveLength(1);
});

test('N-02 检测异常也显示同一报错，Tab 焦点只能在去社群咨询和重试之间移动', async () => {
  const fake = fakeApi({ 'network:check': () => { throw new Error('internal'); } });
  await createApp(root, fake.api);
  expect(query(TID.network.error).textContent).not.toContain('internal');
  expect(document.activeElement).toBe(query(TID.network.retry));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  expect(document.activeElement).toBe(query(TID.help));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  expect(document.activeElement).toBe(query(TID.network.retry));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  expect(document.activeElement).toBe(query(TID.help));
});
