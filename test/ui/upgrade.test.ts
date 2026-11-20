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
beforeEach(() => { document.body.innerHTML = '<div id="app"></div>'; });
afterEach(() => { const gate = $(TID.upgrade.root); gate?.dispatchEvent(new Event('dispose')); document.body.innerHTML = ''; });

describe('简洁强制升级', () => {
  it('V-03 仅显示标题、目标版本和两个按钮，不能用 Escape 跳过', () => {
    const fake = fakeApi();
    showUpgrade(fake.api, root(), INFO, OPTIONS);
    expect(text()).toBe('升级后继续使用请升级到 0.2.0退出 CodexBuddy立即升级');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect($(TID.upgrade.root)).not.toBeNull();
    expect(document.activeElement?.textContent).toBe('退出 CodexBuddy');
  });

  it('V-03 退出调用工具退出接口', async () => {
    const fake = fakeApi();
    showUpgrade(fake.api, root(), INFO, OPTIONS);
    (document.querySelector('.version-dialog button') as HTMLButtonElement).click();
    await settle();
    expect(fake.called('app:quit')).toHaveLength(1);
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

  it('V-05 下载或安装失败可重试', async () => {
    const fake = fakeApi({ 'upgrade:run': { ok: false } });
    showUpgrade(fake.api, root(), INFO, OPTIONS);
    click($(TID.upgrade.download)); await settle();
    expect(text()).toContain('升级没成功');
    expect($(TID.upgrade.download)!.textContent).toBe('再试一次');
    click($(TID.upgrade.download)); await settle();
    expect(fake.called('upgrade:run')).toHaveLength(2);
  });

  it('V-01 断网只允许重新连接或退出；校验中不提供继续入口', async () => {
    const fake = fakeApi();
    showUpgrade(fake.api, root(), null, { ...OPTIONS, status: 'offline' });
    expect(text()).toContain('连上网后才能使用');
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
