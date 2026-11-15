// @vitest-environment happy-dom
// L3: small shell pieces: window.buddy lookup, the 🌐 button, the confirm dialog, the startup update check. Owner: A6.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { windowApi } from '../../ui/api';
import { createApp } from '../../ui/app';
import { dialog } from '../../ui/components/dialog';
import { watchUpdates } from '../../ui/pages/update';
import { TID } from '../../ui/testids';
import { click, fakeApi, settle } from './settings.fake';

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
afterEach(() => { document.body.innerHTML = ''; delete (window as { buddy?: unknown }).buddy; vi.resetModules(); });

describe('window.buddy', () => {
  it('页面不在 CodexBuddy 里打开时报清楚的错；在里面就用它', () => {
    expect(() => windowApi()).toThrow('window.buddy missing');
    const api = fakeApi().api;
    window.buddy = api;
    expect(windowApi()).toBe(api);
  });

  it('有 window.buddy 时页面脚本自己启动', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    window.buddy = fakeApi().api;
    await import('../../ui/app');
    await settle();
    expect($(TID.shell.side)).not.toBeNull();
  });
});

describe('右上角', () => {
  it('🌐 打开右侧浏览器（展开）', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const fake = fakeApi();
    await createApp(document.getElementById('app')!, fake.api);
    click($(TID.shell.browser));
    expect(fake.called('browser:show').map(c => c.args)).toEqual([{ mode: 'expanded' }]);
  });
});

describe('确认弹窗', () => {
  it('确认 → true；取消、Esc、点外面 → false；危险操作按钮是红的；可以没有取消', async () => {
    const yes = dialog({ title: '删掉吗', lines: ['一行'], confirm: '删除', cancel: '先不了', danger: true });
    expect($(TID.dialog.confirm)!.className).toContain('danger');
    expect($(TID.dialog.root)!.textContent).toContain('一行');
    click($(TID.dialog.confirm));
    expect(await yes).toBe(true);

    const cancel = dialog({ title: 't', confirm: '好', cancel: '先不了' });
    click($(TID.dialog.cancel));
    expect(await cancel).toBe(false);

    const esc = dialog({ title: 't', confirm: '好', cancel: '先不了' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect($(TID.dialog.root)).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await esc).toBe(false);

    const outside = dialog({ title: 't', confirm: '好', body: document.createElement('input') });
    expect($(TID.dialog.cancel)).toBeNull();
    click($(TID.dialog.root)); // inside the box: stays
    expect($(TID.dialog.root)).not.toBeNull();
    click(document.querySelector('.scrim'));
    expect(await outside).toBe(false);
    expect($(TID.dialog.root)).toBeNull();
  });
});

describe('启动时查更新', () => {
  it('主进程比页面先发了通知：页面自己问一次，有新版就弹；问失败不报错', async () => {
    const fake = fakeApi({ 'update:check': { kind: 'new', version: '2.0.0', notes: '新' } });
    watchUpdates(fake.api, document.body);
    await settle();
    expect($(TID.update.root)!.textContent).toContain('2.0.0');
    document.body.innerHTML = '';
    watchUpdates(fakeApi({ 'update:check': () => Promise.reject(new Error('offline')) }).api, document.body);
    watchUpdates(fakeApi({ 'update:check': { kind: 'latest' } }).api, document.body);
    await settle();
    expect($(TID.update.root)).toBeNull();
  });
});
