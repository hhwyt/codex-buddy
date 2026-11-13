// @vitest-environment happy-dom
// L3: update dialog (U-01..U-03). Owner: A6.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showUpdate, watchUpdates } from '../../ui/pages/update';
import { TID } from '../../ui/testids';
import { click, fakeApi, settle } from './settings.fake';

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const INFO = { version: '1.1.0', notes: '支持 Kimi\n\n安装更快' };

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('更新弹窗', () => {
  it('U-01 有新版本时弹窗，列出改了什么', () => {
    const fake = fakeApi();
    watchUpdates(fake.api, document.body);
    fake.emit('update', INFO);
    expect($(TID.update.root)!.textContent).toContain('发现新版本 1.1.0');
    expect([...$(TID.update.root)!.querySelectorAll('li')].map(l => l.textContent)).toEqual(['支持 Kimi', '安装更快']);
    fake.emit('update', INFO); // already showing: not twice
    expect(document.querySelectorAll(`[data-testid="${TID.update.root}"]`)).toHaveLength(1);
  });

  it('U-01「稍后」→ 同一个版本一天内不再弹，过了一天或换了版本再弹', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T10:00:00'));
    const fake = fakeApi();
    watchUpdates(fake.api, document.body);
    fake.emit('update', INFO);
    click($(TID.update.later));
    expect($(TID.update.root)).toBeNull();
    expect(fake.called('update:dismiss')[0].args).toEqual({ version: '1.1.0' });
    vi.setSystemTime(new Date('2026-11-14T09:00:00'));
    fake.emit('update', INFO);
    expect($(TID.update.root)).toBeNull();
    fake.emit('update', { version: '1.2.0', notes: '' });
    expect($(TID.update.root)).not.toBeNull();
    click($(TID.update.later));
    vi.setSystemTime(new Date('2026-11-15T11:00:00'));
    fake.emit('update', { version: '1.2.0', notes: '' });
    expect($(TID.update.root)).not.toBeNull();
  });

  it('U-01 本地存储坏了也照样弹', () => {
    localStorage.setItem('codexbuddy.update.dismissed', '{bad');
    const fake = fakeApi();
    watchUpdates(fake.api, document.body);
    fake.emit('update', INFO);
    expect($(TID.update.root)).not.toBeNull();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('off'); } });
    click($(TID.update.later));
    expect($(TID.update.root)).toBeNull();
    vi.unstubAllGlobals();
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
    expect($(TID.toast)!.textContent).toBe('下载断了');
    expect(fake.listeners('step')).toBe(0);
  });

  it('U-02 更新失败没给原因时也有提示', async () => {
    showUpdate(fakeApi({ 'update:install': { ok: false } }).api, document.body, INFO);
    click($(TID.update.now));
    await settle();
    expect($(TID.toast)!.textContent).toBe('没更新成功，稍后再试');
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
});
