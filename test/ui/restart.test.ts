// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createApp } from '../../ui/app';
import { promptRestart, restartNotice } from '../../ui/components/restart';
import { TID } from '../../ui/testids';
import { deferred, fakeApi, settle, walletOf } from './models-fake';
import { appState } from './settings.fake';

const query = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
beforeEach(() => { document.body.innerHTML = ''; });
afterEach(async () => { query(TID.restart.later)?.click(); await settle(); document.body.innerHTML = ''; });

test('M-21 弹窗与定稿文案一致，稍后不调用打开或重启', async () => {
  const api = fakeApi(walletOf());
  const pending = promptRestart(api);
  expect(query(TID.restart.root).textContent).toContain('现在重启 ChatGPT？');
  expect(query(TID.restart.root).textContent).toContain('配置已保存，重启后生效。重启会中断正在进行的任务。');
  expect(document.activeElement).toBe(query(TID.restart.later));
  query(TID.restart.later).click();
  expect(await pending).toBe(false);
  expect(api.callsOf('codex:restart')).toHaveLength(0);
  expect(api.callsOf('codex:open')).toHaveLength(0);
});

test('M-21 确认后只调用一次重启，完成前禁止重复点击和关闭', async () => {
  const api = fakeApi(walletOf());
  const gate = deferred<{ ok: boolean }>();
  api.handle('codex:restart', () => gate.promise);
  const pending = promptRestart(api);
  expect(promptRestart(api)).toBe(pending);
  query(TID.restart.now).click();
  query(TID.restart.now).click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(query(TID.restart.root).textContent).toContain('正在重启 ChatGPT');
  expect(api.callsOf('codex:restart')).toHaveLength(1);
  gate.resolve({ ok: true });
  expect(await pending).toBe(true);
  expect(query(TID.restart.root)).toBeNull();
});

test('M-21 重启失败保留弹窗、去社群咨询和重试入口，不宣称已生效', async () => {
  const api = fakeApi(walletOf());
  let attempts = 0;
  api.handle('codex:restart', () => ({ ok: ++attempts > 1 }));
  const pending = promptRestart(api);
  query(TID.restart.now).click();
  await settle();
  expect(query(TID.restart.root).textContent).toContain('没能重启 ChatGPT');
  expect(query(TID.restart.now).textContent).toBe('重试');
  expect(query(TID.restart.later).hidden).toBe(true);
  expect(query(TID.help)!.hidden).toBe(false);
  expect(query(TID.restart.root).textContent).not.toContain('已生效');
  query(TID.restart.now).click();
  expect(await pending).toBe(true);
  expect(attempts).toBe(2);
});

test('M-21 Esc 等同稍后，Tab 不离开确认框', async () => {
  const pending = promptRestart(fakeApi(walletOf()));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
  expect(document.activeElement).toBe(query(TID.restart.now));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
  expect(document.activeElement).toBe(query(TID.restart.later));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(await pending).toBe(false);
});

test('M-21 待重启提示由持久状态恢复，切页面仍保留，成功事件才收起', async () => {
  const api = fakeApi(walletOf({ active: 'deepseek' }));
  api.handle('app:state', () => appState({ restartRequired: true }));
  const root = document.createElement('div');
  document.body.append(root);
  const app = await createApp(root, api);
  expect(query(TID.restart.notice).hidden).toBe(false);
  await app.go('settings');
  expect(query(TID.restart.notice).hidden).toBe(false);
  api.emit('restartRequired', false);
  expect(query(TID.restart.notice).hidden).toBe(true);
});

test('M-21 共享提示接收变化事件，可以重新弹出重启确认框', async () => {
  const api = fakeApi(walletOf());
  document.body.append(restartNotice(api, false));
  expect(query(TID.restart.notice).hidden).toBe(true);
  api.emit('restartRequired', true);
  expect(query(TID.restart.notice).textContent).toContain('配置已保存，重启 ChatGPT 后生效');
  query(TID.restart.notice).querySelector('button')!.click();
  expect(query(TID.restart.root)).toBeTruthy();
});

test('M-21 未运行时显示保存成功与打开邀请，点击仍执行可靠重启路径', async () => {
  const api = fakeApi(walletOf());
  const pending = promptRestart(api, true, 'DeepSeek');
  expect(query(TID.restart.root).textContent).toContain('配置已保存');
  expect(query(TID.restart.root).textContent).toContain('现在打开 ChatGPT，试试 DeepSeek？');
  expect(query(TID.restart.root).textContent).toContain('正在进行的任务会中断');
  expect(query(TID.restart.now).textContent).toBe('打开 ChatGPT');
  query(TID.restart.now).click();
  expect(await pending).toBe(true);
  expect(api.callsOf('codex:restart')).toHaveLength(1);
  expect(api.callsOf('codex:open')).toHaveLength(0);
});

test('M-21 未运行时稍后不启动；打开失败可以重试', async () => {
  const api = fakeApi(walletOf());
  const later = promptRestart(api, true);
  query(TID.restart.later).click();
  expect(await later).toBe(false);
  expect(api.callsOf('codex:restart')).toHaveLength(0);
  let attempts = 0;
  api.handle('codex:restart', () => ({ ok: ++attempts > 1 }));
  const pending = promptRestart(api, true);
  query(TID.restart.now).click();
  await settle();
  expect(query(TID.restart.root).textContent).toContain('没能打开 ChatGPT');
  query(TID.restart.now).click();
  expect(await pending).toBe(true);
});
