// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { showUpgrade } from '../../ui/pages/upgrade';
import { TID } from '../../ui/testids';
import { click, fakeApi, settle } from './settings.fake';

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const INFO = { version: '0.2.0', notes: '', url: 'https://github.com/x/app.dmg' };
const OPTIONS = { os: 'win' as const, current: '0.1.0', qr: '' };
const root = () => document.getElementById('app')!;
const text = () => $(TID.upgrade.root)!.textContent!;
beforeEach(() => { document.body.innerHTML = '<div id="app"></div>'; localStorage.clear(); });
afterEach(() => { const gate = $(TID.upgrade.root); gate?.dispatchEvent(new Event('dispose')); document.body.innerHTML = ''; });

describe('简洁强制升级', () => {
  it('V-03 仅显示标题、目标版本和一个蓝色「立即升级」，不能用 Escape 跳过', () => {
    const fake = fakeApi();
    showUpgrade(fake.api, root(), INFO, OPTIONS);
    expect(text()).toContain('升级后继续使用');
    expect(text()).toContain('请升级到 0.2.0');
    expect(text()).toContain('立即升级');
    expect($(TID.help)!.hidden).toBe(true);
    expect($(TID.upgrade.skip)!.hidden).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect($(TID.upgrade.root)).not.toBeNull();
    expect(document.activeElement?.textContent).toBe('立即升级');
  });

  it('V-05 下载时去重，显示进度，完成后进入安装状态', async () => {
    let finish!: (result: { ok: boolean }) => void;
    const fake = fakeApi({ 'upgrade:run': () => new Promise(resolve => { finish = resolve; }) });
    showUpgrade(fake.api, root(), INFO, OPTIONS);
    click($(TID.upgrade.download)); click($(TID.upgrade.download));
    fake.emit('step', { flow: 'upgrade', id: 'download', state: 'start', text: '42%' });
    expect(($(TID.upgrade.progress) as HTMLProgressElement).value).toBe(42);
    expect(fake.called('upgrade:run')).toHaveLength(1);
    finish({ ok: true }); await settle();
    expect(text()).toContain('正在安装更新');
    expect($(TID.upgrade.download)!.hidden).toBe(true);
  });

  it('V-05 下载或安装失败可重试，并出现去社群咨询和本次先跳过', async () => {
    const fake = fakeApi({ 'upgrade:run': { ok: false } });
    showUpgrade(fake.api, root(), INFO, OPTIONS);
    expect($(TID.help)!.hidden).toBe(true);
    expect($(TID.upgrade.skip)!.hidden).toBe(true);
    click($(TID.upgrade.download)); await settle();
    expect(text()).toContain('升级没成功');
    expect($(TID.upgrade.download)!.textContent).toBe('重试');
    expect($(TID.help)!.hidden).toBe(false);
    expect($(TID.upgrade.skip)!.hidden).toBe(false);
    click($(TID.upgrade.download)); await settle();
    expect(fake.called('upgrade:run')).toHaveLength(2);
  });

  it('V-05 失败时写真实原因，没有原因才写请检查网络', async () => {
    const fake = fakeApi({ 'upgrade:run': { ok: false, reason: '下载的更新包不完整，请再试一次。' } });
    showUpgrade(fake.api, root(), INFO, OPTIONS);
    click($(TID.upgrade.download)); await settle();
    expect(text()).toContain('升级没成功下载的更新包不完整，请再试一次。');
    expect(fake.called('upgrade:run')).toHaveLength(1);
  });

  it('V-01 断网只允许去社群咨询或重试；校验中不提供继续入口', async () => {
    const fake = fakeApi();
    showUpgrade(fake.api, root(), null, { ...OPTIONS, status: 'offline' });
    expect(text()).toContain('网络问题');
    expect($(TID.help)!.hidden).toBe(false);
    expect($(TID.upgrade.skip)!.hidden).toBe(true);
    click($(TID.upgrade.download)); await settle();
    expect(fake.called('update:check')).toHaveLength(1);
  });

  it('V-05 Mac 下载后提示替换应用，允许再次打开安装包', async () => {
    const fake = fakeApi({ 'upgrade:run': { ok: true } });
    showUpgrade(fake.api, root(), INFO, { ...OPTIONS, os: 'mac' });
    click($(TID.upgrade.download)); await settle();
    expect(text()).toContain('拖进「应用程序」并替换');
    expect($(TID.upgrade.download)!.textContent).toBe('再打开安装包');
    click($(TID.upgrade.download)); await settle();
    expect(fake.called('upgrade:run')).toHaveLength(2);
  });
});
