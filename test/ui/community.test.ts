// @vitest-environment happy-dom
// L3: 社群 page (H-02, ui-design/nav-community.html v1). Owner: A6.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { BUNDLED_QR, communityQr, renderCommunity, XHS_QR } from '../../ui/pages/community';
import { TID } from '../../ui/testids';
import { appState, fakeApi } from './settings.fake';

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const QR = 'data:image/png;base64,QUJD';
const src = () => $(TID.community.qr)!.getAttribute('src');

async function mount(fake: ReturnType<typeof fakeApi>) {
  document.body.innerHTML = '<div id="root"></div>';
  await renderCommunity({ api: fake.api, root: document.getElementById('root')!, go: vi.fn() });
}

beforeEach(() => localStorage.clear());
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('社群页（H-02）', () => {
  it('H-02 群码和小红书码并排，各带两句话，不写群名', async () => {
    await mount(fakeApi());
    const root = $(TID.community.root)!;
    expect(root.querySelector('h1')!.textContent).toBe('社群');
    expect([...root.querySelectorAll('p')].map(p => p.textContent)).toEqual([
      '使用有问题？加群咨询', '企业微信群，扫码就进', '小红书关注小红书', '「黄金金不AI」，看更多 Codex 用法',
    ]);
    expect(root.querySelectorAll('img')).toHaveLength(2);
    expect($(TID.community.xhsQr)!.getAttribute('src')).toBe(XHS_QR);
    expect(existsSync(`ui/${XHS_QR}`)).toBe(true);
    expect(root.querySelectorAll('button, input, textarea, a')).toHaveLength(0);
  });

  it('H-02 一次都没取到：显示 App 自带的企业微信群码', async () => {
    await mount(fakeApi());
    expect(src()).toBe(BUNDLED_QR);
    expect(existsSync(`ui/${BUNDLED_QR}`)).toBe(true);
  });

  it('H-02 在线时远程配置里的新码替换自带的', async () => {
    await mount(fakeApi({ 'app:state': appState({ community: { qrUrl: QR } }) }));
    expect(src()).toBe(QR);
  });

  it('H-02 断网时显示上次取到的', async () => {
    await mount(fakeApi({ 'app:state': appState({ community: { qrUrl: QR } }) }));
    await mount(fakeApi({ 'app:state': appState({ community: { qrUrl: null } }) }));
    expect(src()).toBe(QR);
  });

  it('H-02 本地存储不能用时照样显示在线的码', () => {
    const off = () => { throw new Error('off'); };
    vi.stubGlobal('localStorage', { getItem: off, setItem: off });
    expect(communityQr(QR)).toBe(QR);
    expect(communityQr(null)).toBeNull();
    vi.unstubAllGlobals();
  });
});
