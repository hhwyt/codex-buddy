// @vitest-environment happy-dom
// L3: 🛡 security panel (S-01..S-04, S-06, S-07). Owner: A6.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maskKey, openSecurity, when } from '../../ui/pages/security';
import { TID } from '../../ui/testids';
import { appState, click, fakeApi, settle } from './settings.fake';

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const NOW = Date.now();
const DATA = {
  keys: [{ vendor: 'zhipu', name: '智谱', keyTail: 'a3f9', file: '/sandbox/keys/zhipu' }],
  app: [{ host: 'open.bigmodel.cn', allowed: true, at: NOW - 5_000 }, { host: 'open.bigmodel.cn', allowed: true, at: NOW - 900_000 }, { host: 'evil.example', allowed: false, at: NOW }],
  web: [{ host: 'persistent.oaistatic.com', allowed: true, at: NOW - 120_000 }],
};

async function open(fake = fakeApi({ 'security:get': DATA })) {
  document.body.innerHTML = '<div id="root"></div>';
  openSecurity(fake.api, document.getElementById('root')!);
  await settle();
  return fake;
}

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => vi.restoreAllMocks());

describe('安全面板', () => {
  it('S-01 打开面板，Key 已打码，页面上没有完整的 Key', async () => {
    await open();
    const row = $(TID.security.key('zhipu'))!;
    expect(row.textContent).toContain('智谱 sk-••••a3f9');
    expect(row.textContent).toContain('存在这台电脑上');
    expect(maskKey('sk-abcdefghijklmnop')).toBe('sk-••••mnop');
  });

  it('S-01 还没有 Key 时写明', async () => {
    await open(fakeApi({ 'security:get': { keys: [], app: [], web: [] } }));
    expect($(TID.security.root)!.textContent).toContain('还没有 Key');
    expect($(TID.security.appSites)!.textContent).toBe('还没有连过');
  });

  it('S-02 在访达里显示（Mac）/ 在文件夹里显示（Windows）', async () => {
    const fake = await open();
    expect($(TID.security.reveal('zhipu'))!.textContent).toBe('在访达里显示');
    click($(TID.security.reveal('zhipu')));
    expect(fake.called('security:reveal')[0].args).toEqual({ vendor: 'zhipu' });
    await open(fakeApi({ 'security:get': DATA, 'app:state': appState({ os: 'win' }) }));
    expect($(TID.security.reveal('zhipu'))!.textContent).toBe('在文件夹里显示');
  });

  it('S-03 去官网管理', async () => {
    const fake = await open();
    click($(TID.security.manage('zhipu')));
    expect(fake.called('security:manage')[0].args).toEqual({ vendor: 'zhipu' });
  });

  it('S-04 连过的网站分两块，同一个网站只列一次，拦下的标出来，最后写「没有别的了」', async () => {
    await open();
    const app = $(TID.security.appSites)!;
    expect(app.querySelectorAll('.kv')).toHaveLength(2);
    expect(app.textContent).toContain('open.bigmodel.cn');
    expect(app.textContent).toContain('刚刚');
    expect(app.querySelector('.blocked')!.textContent).toContain('evil.example已拦下');
    expect(app.textContent).toContain('没有别的了');
    expect($(TID.security.webSites)!.textContent).toContain('persistent.oaistatic.com2 分钟前');
  });

  it('S-04 连过的网站不等 app:state（Windows 上要一两秒）就先列出来', async () => {
    await open(fakeApi({ 'security:get': DATA, 'app:state': () => new Promise(() => {}) }));
    expect($(TID.security.appSites)!.textContent).toContain('open.bigmodel.cn');
    expect($(TID.security.webSites)!.textContent).toContain('persistent.oaistatic.com');
  });

  it('S-04 实时更新；关掉后不再听', async () => {
    const fake = await open();
    fake.emit('connections', { app: [{ host: 'api.deepseek.com', allowed: true, at: Date.now() }], web: [] });
    expect($(TID.security.appSites)!.textContent).toContain('api.deepseek.com');
    expect($(TID.security.webSites)!.textContent).toBe('还没有连过');
    click($(TID.security.close));
    expect($(TID.security.root)).toBeNull();
    expect(fake.listeners('connections')).toBe(0);
  });

  it('S-06 让 AI 帮我检查：复制写好的提问', async () => {
    const write = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    await open(fakeApi({ 'security:get': DATA, 'security:ask-ai': { text: '请帮我看看这个仓库' } }));
    click($(TID.security.askAi));
    await settle();
    expect(write).toHaveBeenCalledWith('请帮我看看这个仓库');
    expect($(TID.toast)!.textContent).toBe('已复制，粘到你自己的 AI 里问问');
  });

  it('S-06 复制失败时提示', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } }, configurable: true });
    await open(fakeApi({ 'security:get': DATA, 'security:ask-ai': { text: 'x' } }));
    click($(TID.security.askAi));
    await settle();
    expect($(TID.toast)!.textContent).toBe('没复制成功，再试一次');
  });

  it('S-07 查看源代码', async () => {
    const fake = await open();
    click($(TID.security.source));
    expect(fake.called('security:source')).toHaveLength(1);
  });

  it('S-01 再点 🛡 或按 Esc 关掉面板', async () => {
    const fake = await open();
    openSecurity(fake.api, document.getElementById('root')!);
    expect($(TID.security.root)).toBeNull();
    openSecurity(fake.api, document.getElementById('root')!);
    await settle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect($(TID.security.root)).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect($(TID.security.root)).toBeNull();
  });

  it('S-04 时间写成人话', () => {
    const now = new Date('2026-11-13T15:00:00').getTime();
    expect(when(now - 10_000, now)).toBe('刚刚');
    expect(when(now - 5 * 60_000, now)).toBe('5 分钟前');
    expect(when(now - 3 * 3600_000, now)).toBe('今天');
    expect(when(new Date('2026-11-02T09:00:00').getTime(), now)).toBe('11 月 2 日');
    expect(when(now + 5000, now)).toBe('刚刚');
  });
});

describe('安全面板出错时', () => {
  it('S-01 后台没给出列表时面板照样打开', async () => {
    await open(fakeApi({ 'security:get': { ok: false, reason: '这个功能还没做好' } }));
    expect($(TID.security.root)!.textContent).toContain('还没有 Key');
    expect($(TID.security.webSites)!.textContent).toBe('还没有连过');
  });
});
