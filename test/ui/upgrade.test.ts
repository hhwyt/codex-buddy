// @vitest-environment happy-dom
// L3: forced upgrade screen (ui-design/force-upgrade.html v4). Owner: A6.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showUpgrade } from '../../ui/pages/upgrade';
import { TID } from '../../ui/testids';
import { click, fakeApi, settle } from './settings.fake';

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const INFO = { version: '0.2.0', notes: '', url: 'https://x/CodexBuddy-0.2.0.dmg' };
const MAC = { os: 'mac' as const, current: '0.1.0', qr: 'assets/community-qr.png' };
const text = () => $(TID.upgrade.root)!.textContent!;
const step = (state: 'start' | 'done' | 'fail', t: string) => ({ flow: 'upgrade' as const, id: 'download', state, text: t });

/** upgrade:run that waits until the test lets it finish */
function pending(result: unknown = { ok: true }) {
  let finish!: () => void;
  const answer = () => new Promise(r => { finish = () => r(result); });
  return { answer, finish: () => finish() };
}

beforeEach(() => { document.body.innerHTML = '<div id="app"></div>'; });
afterEach(() => { vi.restoreAllMocks(); });

describe('强制升级页（第 4 版）', () => {
  it('一进来：圆环中间是要的版本，「该升级了」、当前 → 需要、Codex 照常能用', () => {
    showUpgrade(fakeApi().api, document.getElementById('app')!, INFO, MAC);
    expect(text()).toContain('该升级了');
    expect(text()).toContain('当前 0.1.0→需要 0.2.0');
    expect(text()).toContain('Codex 照常能用');
    expect($(TID.upgrade.progress)!.textContent).toBe('0.2.0');
    expect($(TID.upgrade.download)!.textContent).toBe('下载新版');
    expect(document.querySelector('.bar')!.getAttribute('stroke-dashoffset')).toBe(document.querySelector('.bar')!.getAttribute('stroke-dasharray'));
  });

  it('Mac：下载 → 圆环走百分比和 MB → 演示拖进「应用程序」→ 再打开安装包 / 退出', async () => {
    const run = pending();
    const fake = fakeApi({ 'upgrade:run': run.answer });
    showUpgrade(fake.api, document.getElementById('app')!, INFO, MAC);
    click($(TID.upgrade.download));
    expect(text()).toContain('正在下载 0.2.0');
    fake.emit('step', step('start', '42% · 36.1 / 86.0 MB'));
    fake.emit('step', { flow: 'update', id: 'download', state: 'start', text: '99%' }); // the ordinary update dialog's flow: ignored
    expect($(TID.upgrade.progress)!.textContent).toBe('42%');
    expect(text()).toContain('36.1 / 86.0 MB');
    const offset = Number(document.querySelector('.bar')!.getAttribute('stroke-dashoffset'));
    expect(offset).toBeCloseTo(2 * Math.PI * 63 * 0.58, 1);
    fake.emit('step', step('done', '100%')); // Mac waits for the dmg to open
    expect(text()).toContain('正在下载');
    run.finish();
    await settle();
    expect(text()).toContain('把它拖进「应用程序」');
    expect(document.querySelector('.upg-dmg')).not.toBeNull();
    click($(TID.upgrade.reopen));
    expect(fake.called('upgrade:run')).toHaveLength(2);
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    click($(TID.upgrade.quit));
    expect(close).toHaveBeenCalled();
  });

  it('Windows：「下载并安装」→ 下好就转成安装中（安装包会关掉旧版、打开新版）', async () => {
    const run = pending();
    const fake = fakeApi({ 'upgrade:run': run.answer });
    showUpgrade(fake.api, document.getElementById('app')!, INFO, { ...MAC, os: 'win' });
    expect($(TID.upgrade.download)!.textContent).toBe('下载并安装');
    click($(TID.upgrade.download));
    fake.emit('step', step('start', '12.0 MB')); // size unknown: no percent
    expect($(TID.upgrade.progress)!.textContent).toBe('0%');
    expect(text()).toContain('12.0 MB');
    fake.emit('step', step('done', '100%'));
    expect(text()).toContain('正在安装');
    expect($(TID.upgrade.progress)!.classList.contains('spinning')).toBe(true);
    run.finish();
    await settle();
    expect(text()).toContain('装好会自动打开新版');
  });

  it('只报了百分比没报大小：大小那行先空着；没给失败原因时用默认的话', async () => {
    const run = pending({ ok: false });
    const fake = fakeApi({ 'upgrade:run': run.answer });
    showUpgrade(fake.api, document.getElementById('app')!, INFO, MAC);
    click($(TID.upgrade.download));
    fake.emit('step', step('start', '7%'));
    expect($(TID.upgrade.progress)!.textContent).toBe('7%');
    expect(document.querySelector('.upg-size')!.textContent).toBe('');
    run.finish();
    await settle();
    expect($(TID.toast)!.textContent).toBe('下载没成功，检查一下网络再试');
  });

  it('下载失败：回到第一屏，报原因', async () => {
    const fake = fakeApi({ 'upgrade:run': { ok: false, reason: '下载没成功，检查一下网络再试' } });
    showUpgrade(fake.api, document.getElementById('app')!, INFO, MAC);
    click($(TID.upgrade.download));
    await settle();
    expect(text()).toContain('该升级了');
    expect($(TID.toast)!.textContent).toBe('下载没成功，检查一下网络再试');
  });

  it('有问题？加群咨询：弹出群码，点「关闭」或空白处收起', () => {
    showUpgrade(fakeApi().api, document.getElementById('app')!, INFO, MAC);
    click($(TID.upgrade.ask));
    expect($(TID.upgrade.qr)!.getAttribute('src')).toBe('assets/community-qr.png');
    expect(text()).toContain('使用有问题？加群咨询');
    click($(TID.upgrade.qrClose));
    expect($(TID.upgrade.qr)).toBeNull();
    click($(TID.upgrade.ask));
    click($(TID.upgrade.qr)); // inside the card: stays
    expect($(TID.upgrade.qr)).not.toBeNull();
    click(document.querySelector('.upg-qr'));
    expect($(TID.upgrade.qr)).toBeNull();
  });
});
