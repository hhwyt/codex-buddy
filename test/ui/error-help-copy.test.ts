// @vitest-environment happy-dom
// E-02: 点「去社群咨询」复制日志（Key 打码）后进社群页；复制失败时不显示「已复制」。
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../ui/app';
import { TID } from '../../ui/testids';
import { fakeApi, settle } from './settings.fake';

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

it('E-02 触发 help 复制打码日志并显示已复制；剪贴板失败时不显示', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  const fake = fakeApi({ 'network:check': { ok: true }, 'install:log': { text: 'sk-secretsecret1234 普通日志' } });
  await createApp(document.body, fake.api);

  // 成功：日志打码后写入剪贴板，社群页出现「已复制」。
  window.dispatchEvent(new CustomEvent('codexbuddy:help'));
  await settle();
  expect(writeText).toHaveBeenCalledWith('sk-•••• 普通日志');
  expect($(TID.community.root)).not.toBeNull();
  expect($(TID.community.copied)).not.toBeNull();

  // 失败：照样进社群页，但没有「已复制」这一行。
  writeText.mockRejectedValue(new Error('denied'));
  window.dispatchEvent(new CustomEvent('codexbuddy:help'));
  await settle();
  expect($(TID.community.root)).not.toBeNull();
  expect($(TID.community.copied)).toBeNull();
});
