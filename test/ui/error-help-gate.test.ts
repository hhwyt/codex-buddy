// @vitest-environment happy-dom
// E-03: 强制升级锁屏下点「去社群咨询」收起升级门、进入社群页；点其他导航升级门回来。
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../ui/app';
import { TID } from '../../ui/testids';
import { appState, fakeApi, settle } from './settings.fake';

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

it('E-03 升级门：去社群咨询暂时收起，点「模型」回来', async () => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  const fake = fakeApi({
    'network:check': { ok: true },
    'install:log': { text: '普通日志' },
    'app:state': appState({ upgradeRequired: { version: '0.2.0', notes: '', url: 'https://github.com/x/app.dmg' } }),
  });
  await createApp(document.body, fake.api);

  expect($(TID.upgrade.root)).not.toBeNull();
  expect($(TID.upgrade.root)!.hidden).toBe(false);

  window.dispatchEvent(new CustomEvent('codexbuddy:help'));
  await settle();
  expect($(TID.upgrade.root)!.hidden).toBe(true);
  expect($(TID.community.root)).not.toBeNull();

  $(TID.shell.navModels)!.click();
  await settle();
  expect($(TID.upgrade.root)!.hidden).toBe(false);
});
