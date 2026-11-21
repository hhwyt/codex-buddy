// @vitest-environment happy-dom
// L3: update dialog (U-01..U-03). Owner: A6.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showUpdate, watchUpdates } from '../../ui/pages/update';
import { createApp } from '../../ui/app';
import { TID } from '../../ui/testids';
import { click, fakeApi, settle } from './settings.fake';

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const INFO = { version: '1.1.0', notes: '支持 Kimi\n\n安装更快' };

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('更新弹窗', () => {
  it('U-01 收到更新事件只调用 onNew，不弹窗', () => {
    const fake = fakeApi();
    const seen: { version: string; notes: string }[] = [];
    watchUpdates(fake.api, info => seen.push(info));
    fake.emit('update', INFO);
    expect($(TID.update.root)).toBeNull();
    expect(seen).toEqual([INFO]);
    fake.emit('update', INFO);
    expect(seen).toHaveLength(2);
  });

  it('U-01「稍后」只关弹窗，不再记住版本、不调 update:dismiss', () => {
    const fake = fakeApi();
    showUpdate(fake.api, document.body, INFO);
    click($(TID.update.later));
    expect($(TID.update.root)).toBeNull();
    expect(fake.called('update:dismiss')).toHaveLength(0);
  });

  it('U-02 立即更新 → 进度 → 重启', async () => {
    const fake = fakeApi({ 'update:install': { ok: true } });
    showUpdate(fake.api, document.body, INFO);
    let resolve!: (v: unknown) => void;
    const answers = [new Promise(r => { resolve = r; }), { ok: true }];
    fake.api.invoke = (async (c: string) => { fake.calls.push({ channel: c as never, args: undefined }); return c === 'update:install' ? answers.shift() : undefined; }) as never;
    click($(TID.update.now));
    expect($(TID.update.progress)!.hidden).toBe(false);
    expect($(TID.update.later)!.hidden).toBe(true);
    expect($(TID.update.root)!.textContent).toContain('正在更新');
    fake.emit('step', { flow: 'update', id: 'download', state: 'start', text: '下载 37%' });
    expect($(TID.update.progress)!.textContent).toBe('37%');
    fake.emit('step', { flow: 'install', id: 'x', state: 'start', text: '55%' });
    fake.emit('step', { flow: 'update', id: 'x', state: 'start', text: '正在校验' });
    expect($(TID.update.progress)!.textContent).toBe('37%');
    resolve({ ok: true });
    await settle();
    expect($(TID.update.now)!.textContent).toBe('重启');
    expect($(TID.update.progress)!.textContent).toBe('100%');
    click($(TID.update.now));
    await settle();
    expect(fake.calls.filter(c => c.channel === 'update:install')).toHaveLength(2);
  });

  it('U-02 更新失败：关掉弹窗，提示原因', async () => {
    const fake = fakeApi({ 'update:install': { ok: false, reason: '下载断了' } });
    showUpdate(fake.api, document.body, INFO);
    click($(TID.update.now));
    await settle();
    expect($(TID.update.root)).toBeNull();
    expect($(TID.toast)!.textContent).toContain('下载断了');
    expect(fake.listeners('step')).toBe(0);
  });

  it('U-02 更新失败没给原因时也有提示', async () => {
    showUpdate(fakeApi({ 'update:install': { ok: false } }).api, document.body, INFO);
    click($(TID.update.now));
    await settle();
    expect($(TID.toast)!.textContent).toContain('没更新成功，稍后再试');
  });

  it('U-03 Mac 没签名：立即更新改成在右侧浏览器打开下载页', async () => {
    const fake = fakeApi({ 'update:install': { ok: true, downloadPage: true } });
    showUpdate(fake.api, document.body, INFO);
    click($(TID.update.now));
    await settle();
    expect($(TID.update.root)).toBeNull();
    expect($(TID.toast)!.textContent).toBe('已在右侧打开下载页');
  });

  it('U-01 同时只有一个更新框', () => {
    const fake = fakeApi();
    showUpdate(fake.api, document.body, INFO);
    showUpdate(fake.api, document.body, { version: '1.2.0', notes: '' });
    expect(document.querySelectorAll(`[data-testid="${TID.update.root}"]`)).toHaveLength(1);
    expect($(TID.update.root)!.textContent).toContain('1.2.0');
  });

  it('F-02 下载好后标题「下载好了」，按钮只有「稍后」「重启」', async () => {
    const fake = fakeApi({ 'update:install': { ok: true } });
    showUpdate(fake.api, document.body, INFO);
    click($(TID.update.now));
    await settle();
    expect($(TID.update.root)!.textContent).toContain('下载好了');
    expect($(TID.update.later)!.hidden).toBe(false);
    expect($(TID.update.now)!.textContent).toBe('重启');
    expect([...$(TID.update.root)!.querySelectorAll('button')].map(b => b.textContent)).toEqual(['稍后', '重启']);
  });

  it('F-01 有新版本不弹窗，左下角出现「有新版本」，点了出弹窗，稍后后 badge 还在', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const fake = fakeApi({ 'update:check': { kind: 'new', version: '26.11.2', notes: '更新说明' } });
    await createApp(document.getElementById('app')!, fake.api);
    await settle();
    expect($(TID.update.root)).toBeNull();
    const badge = $(TID.update.badge)!;
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toContain('有新版本');
    expect(badge.textContent).toContain('26.11.2');
    click(badge);
    expect($(TID.update.root)!.textContent).toContain('有新版本 26.11.2');
    click($(TID.update.later));
    expect($(TID.update.root)).toBeNull();
    expect($(TID.update.badge)!.hidden).toBe(false);
  });
});
