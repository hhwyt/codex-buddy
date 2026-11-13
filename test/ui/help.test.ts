// @vitest-environment happy-dom
// L3: help page (H-01, H-02). Owner: A6.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { communityQr, renderHelp } from '../../ui/pages/help';
import { TID } from '../../ui/testids';
import { appState, click, fakeApi, settle } from './settings.fake';

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const QR = 'data:image/png;base64,QUJD';

async function mount(fake: ReturnType<typeof fakeApi>) {
  document.body.innerHTML = '<div id="root"></div>';
  await renderHelp({ api: fake.api, root: document.getElementById('root')!, go: vi.fn() });
}

beforeEach(() => localStorage.clear());
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('报错解读（H-01）', () => {
  it('H-01 粘贴报错 → 出解读 →「知道了」收起', async () => {
    const fake = fakeApi({ 'help:explain': { title: '对话太长了', body: '开个新对话接着做' } });
    await mount(fake);
    const input = $(TID.help.errorInput) as HTMLTextAreaElement;
    expect(($(TID.help.explain) as HTMLButtonElement).disabled).toBe(true);
    input.value = 'stream error: context_length_exceeded';
    input.dispatchEvent(new Event('input'));
    expect(($(TID.help.explain) as HTMLButtonElement).disabled).toBe(false);
    click($(TID.help.explain));
    await settle();
    expect(fake.called('help:explain')[0].args).toEqual({ text: 'stream error: context_length_exceeded' });
    expect($(TID.help.explanation)!.hidden).toBe(false);
    expect($(TID.help.explanation)!.textContent).toContain('对话太长了');
    expect($(TID.help.explanation)!.textContent).toContain('开个新对话接着做');
    click($(TID.help.gotIt));
    expect($(TID.help.explanation)!.hidden).toBe(true);
    expect(input.value).toBe('');
    expect(($(TID.help.explain) as HTMLButtonElement).disabled).toBe(true);
  });

  it('H-01 只粘了空格时按钮不能点', async () => {
    await mount(fakeApi());
    const input = $(TID.help.errorInput) as HTMLTextAreaElement;
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    expect(($(TID.help.explain) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('社群码（H-02）', () => {
  it('H-02 在线时显示最新的社群码和说明', async () => {
    await mount(fakeApi({ 'app:state': appState({ community: { qrUrl: QR, text: '扫码进群' } }) }));
    expect($(TID.help.community)!.querySelector('img')!.getAttribute('src')).toBe(QR);
    expect(document.body.textContent).toContain('扫码进群');
  });

  it('H-02 断网时显示上次取到的', async () => {
    await mount(fakeApi({ 'app:state': appState({ community: { qrUrl: QR, text: '' } }) }));
    await mount(fakeApi({ 'app:state': appState({ community: { qrUrl: null, text: '' } }) }));
    expect($(TID.help.community)!.querySelector('img')!.getAttribute('src')).toBe(QR);
  });

  it('H-02 一次都没取到：写「连上网后显示」', async () => {
    await mount(fakeApi());
    expect($(TID.help.community)!.querySelector('img')).toBeNull();
    expect($(TID.help.community)!.textContent).toBe('连上网后显示');
    expect(document.body.textContent).toContain('把报错发给我们');
  });

  it('H-02 本地存储不能用时照样显示在线的码', () => {
    const off = () => { throw new Error('off'); };
    vi.stubGlobal('localStorage', { getItem: off, setItem: off });
    expect(communityQr(QR)).toBe(QR);
    expect(communityQr(null)).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('报错解读出错时（H-01）', () => {
  it('H-01 后台出错时也给一句话，并指向扫码问我们', async () => {
    await mount(fakeApi({ 'help:explain': { ok: false } }));
    const input = $(TID.help.errorInput) as HTMLTextAreaElement;
    input.value = 'x';
    input.dispatchEvent(new Event('input'));
    click($(TID.help.explain));
    await settle();
    expect($(TID.help.explanation)!.textContent).toContain('暂时看不懂这条报错');
    expect($(TID.help.explanation)!.textContent).toContain('扫下面的码进群');
  });
});
