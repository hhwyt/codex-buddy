// @vitest-environment happy-dom
// Model page (L3): 叠卡切换 M-*、摊开分身 C-* 的界面部分. Owner: A5.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderModels, mountModels } from '../../ui/pages/models';
import { TID } from '../../ui/testids';
import { cardFace, faceClass, logoSrc } from '../../ui/components/card';
import { deferred, drag, fakeApi, settle, tap, walletOf, type FakeApi } from './models-fake';

const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const card = (v: string) => q(TID.models.card(v))!;
const rowOf = (v: string) => Number(card(v).dataset.row);
const click = (id: string) => { const el = q(id); if (!el) throw new Error(`missing ${id}`); el.click(); };
const text = (v: string) => card(v).textContent ?? '';
const toastText = () => q(TID.toast)?.textContent ?? '';

let root: HTMLElement;
let api: FakeApi;
let cleanup: (() => void) | undefined;

async function mount(w = walletOf()) {
  api = fakeApi(w);
  cleanup = (await renderModels({ api, root, go: () => {} })) as () => void;
  await settle();
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  root = document.createElement('section');
  document.body.append(root);
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.useRealTimers(); });

describe('叠卡', () => {
  it('M-01 第一次进来：所有卡都在，没有正在用的', async () => {
    await mount();
    for (const v of ['deepseek', 'zhipu', 'kimi', 'qwen', 'minimax', 'hunyuan', 'openai']) expect(card(v)).toBeTruthy();
    expect(document.querySelectorAll('.card.cur').length).toBe(0);
    expect(document.body.textContent).not.toContain('✓ 能用');
    // nothing in use: a「选一个模型」line on top, every card only a head, so the top one does not look in use
    expect(q(TID.models.guide)!.hidden).toBe(false);
    expect(q(TID.models.guide)!.textContent).toBe('选一个模型');
    expect(document.querySelectorAll('.card.whole').length).toBe(0);
    expect(rowOf('deepseek')).toBe(0); // read top to bottom: order[0] at the top
    expect(rowOf('zhipu')).toBe(1);
    expect(card('deepseek').style.transform).toBe('translate(-190px, 0px)');
    expect(card('zhipu').style.transform).toBe('translate(-190px, 50px)');
    expect(text('deepseek')).toContain('按用量付费');
    expect(q(TID.models.cardModel('deepseek'))!.textContent).toBe('—');
    expect(q(TID.models.changeKey('deepseek'))).toBeNull();
    expect(q(TID.models.recharge('deepseek'))).toBeNull();
    expect(q(TID.models.addVendor)?.textContent).toBe('＋ 其他厂商');
    expect(readFileSync('ui/index.html', 'utf8')).toContain('href="models.css"');
  });

  it('M-02 点后面的卡 → 抽到最上层 → 开始切换', async () => {
    await mount(walletOf({ active: 'deepseek' }, { deepseek: { keyTail: '7c21', model: 'deepseek-flash' } }));
    const gate = deferred<any>();
    api.handle('switch:start', () => gate.promise);
    tap(card('kimi'));
    await settle();
    expect(api.callsOf('switch:start')).toEqual([{ vendor: 'kimi' }]);
    expect(rowOf('kimi')).toBe(0);
    expect(rowOf('deepseek')).toBe(1); // the one in use so far comes second
    expect(text('kimi')).toContain('扫码登录');
    gate.resolve({ ok: true });
    await settle();
    expect(text('kimi')).toContain('✓ 能用');
    expect(card('kimi').classList.contains('whole')).toBe(true);
    expect(card('deepseek').classList.contains('whole')).toBe(false);
    expect(card('deepseek').style.transform).toBe('translate(-190px, 218px)'); // tucked 22px under the top card
    expect(card('kimi').classList.contains('cur')).toBe(true);
    expect(api.callsOf('wallet:reorder')[0].order[0]).toBe('kimi');
    expect(toastText()).toContain('已切换到 Kimi');
  });

  it('M-02 点已经在用的那张卡不再切换', async () => {
    await mount(walletOf({ active: 'deepseek' }));
    tap(card('deepseek'));
    await settle();
    expect(api.callsOf('switch:start')).toEqual([]);
  });

  it('M-02 键盘回车也能切换', async () => {
    await mount();
    card('qwen').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(api.callsOf('switch:start')).toEqual([{ vendor: 'qwen' }]);
  });

  it('M-03 把下面的卡拖到最上面 → 切换', async () => {
    await mount(walletOf({ active: 'deepseek' }));
    expect(rowOf('qwen')).toBe(3);
    expect(card('qwen').style.transform).toBe('translate(-190px, 318px)');
    drag(card('qwen'), -250);
    await settle();
    expect(api.callsOf('switch:start')).toEqual([{ vendor: 'qwen' }]);
    expect(rowOf('qwen')).toBe(0);
    expect(rowOf('deepseek')).toBe(1);
  });

  it('M-03 第一次进来把卡拖到最上面也切换', async () => {
    await mount();
    expect(card('zhipu').style.transform).toBe('translate(-190px, 50px)');
    drag(card('zhipu'), -50);
    await settle();
    expect(api.callsOf('switch:start')).toEqual([{ vendor: 'zhipu' }]);
    expect(q(TID.models.guide)!.hidden).toBe(true);
    expect(card('zhipu').classList.contains('whole')).toBe(true);
  });

  it('M-05 第一次进来拖到中间只调顺序，引导还在', async () => {
    await mount();
    drag(card('deepseek'), 120);
    await settle();
    expect(api.callsOf('switch:start')).toEqual([]);
    expect(rowOf('deepseek')).toBe(0); // dragging the top card down puts it back
    drag(card('minimax'), -100);
    await settle();
    expect(api.callsOf('switch:start')).toEqual([]);
    expect(rowOf('minimax')).toBe(2);
    expect(api.callsOf('wallet:reorder')[0].order.slice(0, 3)).toEqual(['deepseek', 'zhipu', 'minimax']);
    expect(q(TID.models.guide)!.hidden).toBe(false);
  });

  it('M-04 拖动途中，其他卡让位', async () => {
    await mount(walletOf({ active: 'deepseek' }));
    expect(rowOf('minimax')).toBe(4);
    drag(card('qwen'), 50, { release: false });
    expect(rowOf('minimax')).toBe(3); // minimax moved up to make room
    expect(rowOf('qwen')).toBe(4);
    expect(card('qwen').classList.contains('drag')).toBe(true);
    card('qwen').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 50 }));
    await settle();
    expect(card('qwen').classList.contains('drag')).toBe(false);
  });

  it('M-05 拖了但没到最上面不切换，只调整顺序', async () => {
    await mount(walletOf({ active: 'deepseek' }));
    drag(card('qwen'), -100);
    await settle();
    expect(api.callsOf('switch:start')).toEqual([]);
    const [{ order }] = api.callsOf('wallet:reorder');
    expect(order[0]).toBe('deepseek');
    expect(order[1]).toBe('qwen');
    expect(rowOf('deepseek')).toBe(0);
    expect(rowOf('qwen')).toBe(1);
  });

  it('M-05 把最上面的卡往下拖不会切到别的卡', async () => {
    await mount(walletOf({ active: 'deepseek' }));
    drag(card('deepseek'), 300);
    await settle();
    expect(api.callsOf('switch:start')).toEqual([]);
    expect(rowOf('deepseek')).toBe(0);
    drag(card('deepseek'), 60); // stays in the top half: still on top
    await settle();
    expect(api.callsOf('switch:start')).toEqual([]);
    expect(api.callsOf('wallet:reorder')).toEqual([]);
  });

  it('M-05 拖动不到 4 像素算点击', async () => {
    await mount(walletOf({ active: 'deepseek' }));
    drag(card('qwen'), 3);
    await settle();
    expect(api.callsOf('switch:start')).toEqual([{ vendor: 'qwen' }]);
  });

  it('M-06 切换中再点别的卡不响应，模式开关也不响应', async () => {
    await mount();
    const gate = deferred<any>();
    api.handle('switch:start', () => gate.promise);
    tap(card('kimi'));
    await settle();
    tap(card('qwen'));
    drag(card('minimax'), 300);
    click(TID.models.modeClone);
    await settle();
    expect(api.callsOf('switch:start')).toEqual([{ vendor: 'kimi' }]);
    expect(api.callsOf('wallet:mode')).toEqual([]);
    expect(root.querySelector('.models')!.classList.contains('busy')).toBe(true);
    gate.resolve({ ok: true });
    await settle();
  });

  it('M-07 测试连通没通过 → 卡抖一下退回原位', async () => {
    await mount(walletOf({ active: 'deepseek' }, { openai: { keyTail: null } }));
    api.handle('switch:start', () => ({ ok: false, reason: '连不上，原来的配置没动' }));
    tap(card('openai'));
    await settle();
    expect(card('openai').classList.contains('shake')).toBe(true);
    expect(text('openai')).toContain('✗ 连不上');
    expect(toastText()).toBe('连不上，原来的配置没动');
    await new Promise(r => setTimeout(r, 450));
    expect(card('openai').classList.contains('shake')).toBe(false);
    expect(rowOf('openai')).toBe(6);
    expect(rowOf('deepseek')).toBe(0);
    expect(api.callsOf('wallet:reorder')).toEqual([]);
  });

  it('M-07 调用出错也当作没连通', async () => {
    await mount();
    api.handle('switch:start', () => { throw new Error('boom'); });
    tap(card('kimi'));
    await settle();
    expect(toastText()).toBe('boom');
  });

  it('M-08 没有 Key 的卡先显示扫码登录，进度事件改成测试连通', async () => {
    await mount();
    const gate = deferred<any>();
    api.handle('switch:start', () => gate.promise);
    tap(card('zhipu'));
    await settle();
    expect(text('zhipu')).toContain('扫码登录');
    api.emit('step', { flow: 'switch', id: 'test', state: 'start', text: '测试连通' });
    expect(text('zhipu')).toContain('测试连通');
    api.emit('step', { flow: 'switch', id: 'login', state: 'start', text: '' });
    expect(text('zhipu')).toContain('扫码登录');
    api.emit('step', { flow: 'install', id: 'test', state: 'start', text: '' });
    api.emit('step', { flow: 'switch', id: 'save', state: 'start', text: '' });
    expect(text('zhipu')).toContain('扫码登录');
    gate.resolve({ ok: true });
    await settle();
    expect(text('zhipu')).toContain('✓ 能用');
  });

  it('M-08 有 Key 的卡直接测试连通', async () => {
    await mount(walletOf({}, { kimi: { keyTail: '5e08' } }));
    const gate = deferred<any>();
    api.handle('switch:start', () => gate.promise);
    tap(card('kimi'));
    await settle();
    expect(text('kimi')).toContain('测试连通');
    gate.resolve({ ok: true });
    await settle();
  });

  it('M-09 扫码中关掉右侧浏览器 = 取消，什么都没改', async () => {
    await mount(walletOf({ active: 'deepseek' }));
    const gate = deferred<any>();
    api.handle('switch:start', () => gate.promise);
    api.handle('switch:cancel', () => { gate.resolve({ ok: false, kind: 'cancelled' }); });
    tap(card('zhipu'));
    await settle();
    api.emit('browser', { open: true, mode: 'expanded', url: 'https://open.bigmodel.cn', canGoBack: false });
    expect(api.callsOf('switch:cancel')).toEqual([]);
    api.emit('browser', { open: false, mode: 'expanded', url: '', canGoBack: false });
    await settle();
    expect(api.callsOf('switch:cancel').length).toBe(1);
    expect(rowOf('deepseek')).toBe(0);
    expect(toastText()).toBe('取消了，什么都没改');
    expect(api.callsOf('wallet:reorder')).toEqual([]);
  });

  it('M-10 建 Key 失败 → 弹窗写原因 →「再试一次」', async () => {
    await mount(walletOf({ active: 'deepseek' }));
    let n = 0;
    api.handle('switch:start', () => (++n === 1 ? { ok: false, kind: 'key-failed', reason: '官网没让建 Key' } : { ok: true }));
    tap(card('zhipu'));
    await settle();
    expect(q(TID.dialog.root)?.textContent).toContain('官网没让建 Key');
    expect(rowOf('deepseek')).toBe(0);
    click(TID.dialog.confirm);
    await settle();
    expect(api.callsOf('switch:start').length).toBe(2);
    expect(text('zhipu')).toContain('✓ 能用');
  });

  it('M-10 建 Key 失败后选「先不了」', async () => {
    await mount();
    api.handle('switch:start', () => ({ ok: false, kind: 'key-failed' }));
    tap(card('zhipu'));
    await settle();
    expect(q(TID.dialog.root)?.textContent).toContain('登录后没能自动建 Key');
    click(TID.dialog.cancel);
    await settle();
    expect(api.callsOf('switch:start').length).toBe(1);
  });

  it('M-11 免费模型不提充值，卡上没有「免费 / 增强」开关', async () => {
    await mount(walletOf({ active: 'zhipu', order: ['zhipu', 'deepseek', 'kimi', 'qwen', 'minimax', 'hunyuan', 'openai'] },
      { zhipu: { keyTail: 'a3f9', model: 'glm-4.5-flash', free: true, paid: true } }));
    expect(q(TID.models.recharge('zhipu'))).toBeNull();
    expect(text('zhipu')).not.toContain('增强');
    expect(text('zhipu')).toContain('✓ 能用');
  });

  it('M-12 有赠送额度 →「先用着」，充值页在画中画里放着', async () => {
    await mount();
    api.handle('switch:start', () => ({ ok: true, trial: true }));
    tap(card('deepseek'));
    await settle();
    expect(text('deepseek')).toContain('还有额度，用完再充');
    click(TID.models.tryLater);
    await settle();
    expect(api.callsOf('browser:show')).toEqual([{ mode: 'pip' }]);
    expect(q(TID.models.tryLater)).toBeNull();
  });

  it('M-13 余额不够 → 去充值 → 充完「再试一次」', async () => {
    await mount(walletOf({ active: 'zhipu', order: ['zhipu', 'deepseek', 'kimi', 'qwen', 'minimax', 'hunyuan', 'openai'] }));
    let n = 0;
    api.handle('switch:start', () => (++n === 1 ? { ok: false, kind: 'no-balance' } : { ok: true }));
    tap(card('deepseek'));
    await settle();
    expect(text('deepseek')).toContain('余额不够');
    click(TID.models.recharge('deepseek'));
    expect(api.callsOf('recharge:open')).toEqual([{ vendor: 'deepseek' }]);
    const retry = [...card('deepseek').querySelectorAll('button')].find(b => b.textContent === '再试一次')!;
    retry.click();
    await settle();
    expect(api.callsOf('switch:start').length).toBe(2);
    expect(text('deepseek')).toContain('✓ 能用');
  });

  it('M-14 免费模型被限速 → 卡上提示，给出「换个模型」', async () => {
    await mount();
    api.handle('switch:start', () => ({ ok: false, kind: 'rate-limited' }));
    tap(card('zhipu'));
    await settle();
    expect(text('zhipu')).toContain('被限速');
    click(TID.models.rateLimitSwap('zhipu'));
    expect(toastText()).toContain('模型菜单');
  });

  it('M-14 用着用着被限速：卡上的提示来自主进程', async () => {
    await mount(walletOf({ active: 'zhipu', order: ['zhipu', 'deepseek', 'kimi', 'qwen', 'minimax', 'hunyuan', 'openai'] },
      { zhipu: { note: '被限速' } }));
    expect(text('zhipu')).toContain('被限速');
    expect(q(TID.models.rateLimitSwap('zhipu'))).toBeTruthy();
  });

  it('M-15 Codex 用不了 →「一键修复」→ 再切一次', async () => {
    await mount();
    let n = 0;
    api.handle('switch:start', () => (++n === 1 ? { ok: false, kind: 'codex-broken' } : { ok: true }));
    tap(card('kimi'));
    await settle();
    expect(text('kimi')).toContain('✗ 用不了');
    click(TID.models.repair);
    await settle();
    expect(api.callsOf('codex:repair').length).toBe(1);
    expect(api.callsOf('switch:start').length).toBe(2);
    expect(text('kimi')).toContain('✓ 能用');
  });

  it('M-15 一键修复没修好就提示原因', async () => {
    await mount();
    api.handle('switch:start', () => ({ ok: false, kind: 'codex-broken' }));
    api.handle('codex:repair', () => ({ ok: false, reason: '修不好' }));
    tap(card('kimi'));
    await settle();
    click(TID.models.repair);
    await settle();
    expect(toastText()).toBe('修不好');
    expect(api.callsOf('switch:start').length).toBe(1);
  });

  it('M-16 进来时 Codex 已经被删了：最上面那张直接给「重新安装」，不显示选一个模型', async () => {
    api = fakeApi(walletOf());
    api.handle('app:state', () => ({ codexInstalled: false }));
    cleanup = (await renderModels({ api, root, go: () => {} })) as () => void;
    await settle();
    expect(q(TID.models.reinstall)).toBeTruthy();
    expect(card('deepseek').classList.contains('whole')).toBe(true);
    expect(q(TID.models.guide)!.hidden).toBe(true);
  });

  it('M-16 Codex 被删了 →「重新安装」', async () => {
    await mount();
    let n = 0;
    api.handle('switch:start', () => (++n === 1 ? { ok: false, kind: 'codex-missing' } : { ok: true }));
    api.handle('codex:reinstall', () => { throw new Error('装不上'); });
    tap(card('kimi'));
    await settle();
    expect(text('kimi')).toContain('Codex 被删了');
    click(TID.models.reinstall);
    await settle();
    expect(toastText()).toBe('装不上');
    api.handle('codex:reinstall', () => ({ ok: true }));
    click(TID.models.reinstall);
    await settle();
    expect(api.callsOf('switch:start').length).toBe(2);
  });

  it('M-17 换 Key：点卡号旁的「换」，测通才替换', async () => {
    await mount(walletOf({ active: 'deepseek' }, { deepseek: { keyTail: '7c21' } }));
    expect(text('deepseek')).toContain('sk-•••• •••• 7c21');
    api.handle('key:replace', () => ({ ok: true }));
    click(TID.models.changeKey('deepseek'));
    await settle();
    expect(api.callsOf('key:replace')).toEqual([{ vendor: 'deepseek' }]);
    expect(toastText()).toBe('换好了，新 Key 测通了');
    expect(api.callsOf('switch:start')).toEqual([]);
  });

  it('M-17 新 Key 不通就保持旧的', async () => {
    await mount(walletOf({ active: 'deepseek' }, { deepseek: { keyTail: '7c21' } }));
    api.handle('key:replace', () => ({ ok: false, reason: '新 Key 没测通' }));
    click(TID.models.changeKey('deepseek'));
    await settle();
    expect(toastText()).toBe('没换成，还在用原来的 Key：新 Key 没测通');
    api.handle('key:replace', () => { throw new Error(''); });
    click(TID.models.changeKey('deepseek'));
    await settle();
    expect(toastText()).toContain('没换成');
    expect(text('deepseek')).toContain('7c21');
  });

  it('M-17 OpenAI 官方账号没有「换」', async () => {
    await mount(walletOf({ active: 'openai', order: ['openai', 'deepseek', 'zhipu', 'kimi', 'qwen', 'minimax', 'hunyuan'] }));
    expect(q(TID.models.changeKey('openai'))).toBeNull();
    expect(card('openai').classList.contains('light')).toBe(true);
  });

  it('M-18 去充值：最上层付费卡右下角「余额 · 去充值 ›」打开官方充值页', async () => {
    await mount(walletOf({ active: 'deepseek' }));
    const pay = q(TID.models.recharge('deepseek'))!;
    expect(pay.textContent).toBe('余额去充值 ›');
    pay.click();
    expect(api.callsOf('recharge:open')).toEqual([{ vendor: 'deepseek' }]);
    expect(q(TID.models.recharge('kimi'))).toBeNull(); // only on the front card
    expect(api.calls.some(c => c.channel === 'switch:start')).toBe(false);
  });

  it('M-19 ＋其他厂商：填写 → 测试连通 → 加一张卡', async () => {
    await mount();
    let added = false;
    api.handle('custom:add', args => {
      if (args.apiKey === 'bad') return { ok: false, reason: '没连通' };
      added = true;
      return { ok: true };
    });
    api.handle('wallet:get', () => {
      const w = walletOf();
      if (added) { w.cards.push({ vendor: 'custom-acme', name: 'Acme', model: 'acme-1', free: false, paid: true, keyTail: 'ab12', cloneMade: false, note: null }); w.order.push('custom-acme'); }
      return w;
    });
    click(TID.models.addVendor);
    click(TID.models.customSubmit);
    expect(document.querySelector('.form-error')?.textContent).toBe('四项都要填');
    const set = (id: string, v: string) => { (q(id) as HTMLInputElement).value = v; };
    set(TID.models.customName, 'Acme');
    set(TID.models.customBaseUrl, 'https://api.acme.test/v1');
    set(TID.models.customModel, 'acme-1');
    set(TID.models.customKey, 'bad');
    expect((q(TID.models.customKey) as HTMLInputElement).type).toBe('password');
    click(TID.models.customSubmit);
    await settle();
    expect(document.querySelector('.form-error')?.textContent).toBe('没连通');
    set(TID.models.customKey, 'sk-good');
    click(TID.models.customSubmit);
    await settle();
    expect(api.callsOf('custom:add').at(-1)).toEqual({ name: 'Acme', baseUrl: 'https://api.acme.test/v1', model: 'acme-1', apiKey: 'sk-good' });
    expect(card('custom-acme')).toBeTruthy();
    expect(card('custom-acme').classList.contains('face-custom')).toBe(true);
    expect(text('custom-acme')).toContain('A');
    expect(document.body.innerHTML).not.toContain('sk-good');
  });

  it('M-19 其他厂商：先不了 / Esc / 点外面 / 出错', async () => {
    await mount();
    click(TID.models.addVendor);
    [...document.querySelectorAll<HTMLElement>('.custom-vendor button')].find(b => b.textContent === '先不了')!.click();
    expect(document.querySelector('.custom-vendor')).toBeNull();
    click(TID.models.addVendor);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(document.querySelector('.custom-vendor')).toBeNull();
    click(TID.models.addVendor);
    (document.querySelector('.custom-vendor') as HTMLElement).click();
    expect(document.querySelector('.custom-vendor')).toBeTruthy();
    (document.querySelector('.scrim') as HTMLElement).click();
    expect(document.querySelector('.custom-vendor')).toBeNull();
    click(TID.models.addVendor);
    api.handle('custom:add', () => { throw new Error('x'); });
    for (const id of [TID.models.customName, TID.models.customBaseUrl, TID.models.customModel, TID.models.customKey]) (q(id) as HTMLInputElement).value = 'v';
    click(TID.models.customSubmit);
    await settle();
    expect(document.querySelector('.form-error')?.textContent).toBe('没连通，检查一下再试');
  });

  it('M-20 第一次成功：弹窗「从零到能用 N 秒」，有「打开 Codex」和关注行', async () => {
    await mount();
    api.handle('switch:start', () => ({ ok: true, firstTime: true, seconds: 47.6 }));
    tap(card('zhipu'));
    await settle();
    expect(q(TID.firstSuccess.root)).toBeTruthy();
    expect(q(TID.firstSuccess.seconds)?.textContent).toBe('48');
    expect(q(TID.firstSuccess.root)?.textContent).toContain('从零到能用');
    expect(q(TID.firstSuccess.root)?.textContent).toContain('关注');
    click(TID.firstSuccess.openCodex);
    expect(api.callsOf('codex:open')).toEqual([{}]);
    expect(q(TID.firstSuccess.root)).toBeNull();
  });

  it('M-20 第一次成功弹窗可以 Esc 或点外面关掉；不是第一次就不弹', async () => {
    await mount();
    api.handle('switch:start', () => ({ ok: true, firstTime: true }));
    tap(card('zhipu'));
    await settle();
    expect(q(TID.firstSuccess.seconds)?.textContent).toBe('0');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(q(TID.firstSuccess.root)).toBeNull();
    tap(card('kimi'));
    await settle();
    q(TID.firstSuccess.root)!.click();
    expect(q(TID.firstSuccess.root)).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    (document.querySelector('.scrim') as HTMLElement).click();
    expect(q(TID.firstSuccess.root)).toBeNull();
    api.handle('switch:start', () => ({ ok: true }));
    tap(card('qwen'));
    await settle();
    expect(q(TID.firstSuccess.root)).toBeNull();
  });

  it('M-21 Codex 开着时切换：多提示一句「重新打开 Codex 生效」，不替用户关 Codex', async () => {
    await mount();
    expect(q(TID.models.reopenHint)!.hidden).toBe(true);
    api.handle('switch:start', () => ({ ok: true, running: true, host: 'api.moonshot.cn' }));
    tap(card('kimi'));
    await settle();
    expect(q(TID.models.reopenHint)!.hidden).toBe(false);
    expect(q(TID.models.reopenHint)!.textContent).toBe('重新打开 Codex 生效');
    expect(toastText()).toBe('已切换到 Kimi · 只连了 api.moonshot.cn');
    expect(api.calls.map(c => c.channel)).not.toContain('codex:open');
  });

  it('M-23 卡片顺序和正在用的那张按主进程给的来', async () => {
    const order = ['kimi', 'deepseek', 'zhipu', 'qwen', 'minimax', 'hunyuan', 'openai'];
    await mount(walletOf({ active: 'kimi', order }));
    expect(rowOf('kimi')).toBe(0);
    expect(rowOf('deepseek')).toBe(1);
    expect(card('kimi').classList.contains('cur')).toBe(true);
    expect(q(TID.models.guide)!.hidden).toBe(true);
  });

  it('M-28 在 Codex 里换了模型，卡片上的模型名跟着变（只显示，不能点）', async () => {
    await mount(walletOf({ active: 'zhipu', order: ['zhipu', 'deepseek', 'kimi', 'qwen', 'minimax', 'hunyuan', 'openai'] }, { zhipu: { model: 'glm-4.5-flash' } }));
    const model = q(TID.models.cardModel('zhipu'))!;
    expect(model.textContent).toBe('glm-4.5-flash');
    expect(model.tagName).toBe('DIV');
    api.emit('wallet', walletOf({ active: 'zhipu', order: ['zhipu', 'deepseek', 'kimi', 'qwen', 'minimax', 'hunyuan', 'openai'] }, { zhipu: { model: 'glm-4.6' } }));
    expect(q(TID.models.cardModel('zhipu'))!.textContent).toBe('glm-4.6');
    expect(q(TID.models.cardModel('kimi'))!.textContent).toBe('—');
  });

  it('M-28 切换中收到的模型变化等切完再画', async () => {
    await mount();
    const gate = deferred<any>();
    api.handle('switch:start', () => gate.promise);
    api.handle('wallet:get', () => walletOf({ active: 'kimi', order: ['kimi', 'deepseek', 'zhipu', 'qwen', 'minimax', 'hunyuan', 'openai'] }, { kimi: { model: 'kimi-k2' } }));
    tap(card('kimi'));
    await settle();
    api.emit('wallet', walletOf({}, { kimi: { model: 'old' } }));
    expect(q(TID.models.cardModel('kimi'))!.textContent).toBe('—');
    gate.resolve({ ok: true });
    await settle();
    expect(q(TID.models.cardModel('kimi'))!.textContent).toBe('kimi-k2');
  });

  it('M-28 拖动中收到的变化等松手再画；失败退回后再画', async () => {
    await mount(walletOf({ active: 'deepseek' }));
    drag(card('qwen'), 30, { release: false });
    api.emit('wallet', walletOf({ active: 'deepseek' }, { qwen: { model: 'qwen3-coder-plus' } }));
    expect(q(TID.models.cardModel('qwen'))!.textContent).toBe('—');
    card('qwen').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 130 }));
    await settle();
    expect(q(TID.models.cardModel('qwen'))!.textContent).toBe('qwen3-coder-plus');
  });

  it('M-02 粘贴 Key 兜底：拿不到 Key 时出现，粘贴后再切', async () => {
    await mount();
    let n = 0;
    api.handle('switch:start', () => (++n === 1 ? { ok: false, kind: 'paste-key' } : { ok: true }));
    api.handle('key:paste', ({ key }) => (key === 'bad' ? { ok: false } : { ok: true }));
    tap(card('hunyuan'));
    await settle();
    const input = card('hunyuan').querySelector<HTMLInputElement>('.paste-input')!;
    click(TID.models.pasteKey('hunyuan'));
    expect(api.callsOf('key:paste')).toEqual([]);
    input.value = 'bad';
    click(TID.models.pasteKey('hunyuan'));
    await settle();
    expect(toastText()).toBe('这个 Key 用不了');
    card('hunyuan').querySelector<HTMLInputElement>('.paste-input')!.value = 'sk-x';
    click(TID.models.pasteKey('hunyuan'));
    await settle();
    expect(api.callsOf('switch:start').length).toBe(2);
    expect(document.body.innerHTML).not.toContain('sk-x');
  });

  it('M-06 按钮上的 pointerdown 不会拖动卡片', async () => {
    await mount(walletOf({ active: 'deepseek' }));
    const btn = q(TID.models.changeKey('deepseek'))!;
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 0 }));
    expect(card('deepseek').classList.contains('drag')).toBe(false);
  });
});

describe('分身', () => {
  it('C-09 模型页顶上「切换｜分身」来回切：摊开成 3 列，切换模式的状态不变', async () => {
    await mount(walletOf({ active: 'kimi', order: ['kimi', 'deepseek', 'zhipu', 'qwen', 'minimax', 'hunyuan', 'openai'] }, { deepseek: { cloneMade: true } }));
    click(TID.models.modeClone);
    await settle();
    expect(api.callsOf('wallet:mode')).toEqual([{ mode: 'clone' }]);
    const page = q(TID.models.root)!;
    expect(page.dataset.mode).toBe('clone');
    expect(q(TID.models.modeClone)!.getAttribute('aria-selected')).toBe('true');
    expect(card('openai').style.transform).toContain('scale(0.6)');
    // original first, then made clones, then the rest; 3 per row
    const ys = ['openai', 'deepseek', 'kimi', 'zhipu'].map(v => card(v).style.transform);
    expect(ys[0]).toContain(', 0px)');
    expect(ys[1]).toContain(', 0px)');
    expect(ys[3]).toContain(', 162px)');
    expect(card('zhipu').classList.contains('todo')).toBe(true);
    expect(card('deepseek').classList.contains('todo')).toBe(false);
    click(TID.models.modeClone); // same mode: nothing
    tap(card('qwen')); // no switching in clone mode
    await settle();
    expect(api.callsOf('switch:start')).toEqual([]);
    click(TID.models.modeSwitch);
    expect(page.dataset.mode).toBe('switch');
    expect(rowOf('kimi')).toBe(0);
    expect(card('kimi').classList.contains('cur')).toBe(true);
  });

  it('C-09 上次停在分身模式，进来就是摊开的', async () => {
    await mount(walletOf({ mode: 'clone' }));
    expect(q(TID.models.root)!.dataset.mode).toBe('clone');
    expect(q(TID.models.cloneOpen('openai'))?.textContent).toBe('打开 ChatGPT') // model-page-final.html: the original card says which app it opens;
    expect(text('openai')).toContain('原来的');
  });

  it('C-01 点没做的卡「做成分身」→ 正在复制 → 做好了', async () => {
    let made = false;
    await mount(walletOf({ mode: 'clone' }));
    const gate = deferred<any>();
    api.handle('clone:make', () => gate.promise);
    api.handle('wallet:get', () => walletOf({ mode: 'clone' }, { kimi: { cloneMade: made } }));
    click(TID.models.cloneMake('kimi'));
    await settle();
    expect(text('kimi')).toContain('正在复制');
    expect(q(TID.models.cloneMake('kimi'))).toBeNull();
    made = true;
    gate.resolve({ ok: true });
    await settle();
    expect(api.callsOf('clone:make')).toEqual([{ vendor: 'kimi' }]);
    expect(toastText()).toContain('「Kimi」');
    expect(q(TID.models.cloneOpen('kimi'))).toBeTruthy();
    expect(text('kimi')).toContain('分身');
    expect(text('kimi')).toContain('自己的聊天记录');
  });

  it('C-01 做分身失败给出原因', async () => {
    await mount(walletOf({ mode: 'clone' }));
    api.handle('clone:make', () => ({ ok: false, reason: '空间不够' }));
    click(TID.models.cloneMake('qwen'));
    await settle();
    expect(toastText()).toBe('空间不够');
    expect(q(TID.models.cloneMake('qwen'))).toBeTruthy();
    api.handle('clone:make', () => { throw new Error('坏了'); });
    click(TID.models.cloneMake('qwen'));
    await settle();
    expect(toastText()).toBe('坏了');
  });

  it('C-02 做好的卡显示「打开」，点了打开那个分身', async () => {
    await mount(walletOf({ mode: 'clone' }, { deepseek: { cloneMade: true } }));
    click(TID.models.cloneOpen('deepseek'));
    await settle();
    expect(api.callsOf('clone:open')).toEqual([{ vendor: 'deepseek' }]);
    click(TID.models.cloneOpen('openai'));
    await settle();
    expect(api.callsOf('codex:open')).toEqual([{}]);
    api.handle('clone:open', () => ({ ok: false }));
    click(TID.models.cloneOpen('deepseek'));
    await settle();
    expect(toastText()).toBe('没打开');
  });

  it('C-07 删除分身：先确认，只删 App', async () => {
    let made = true;
    await mount(walletOf({ mode: 'clone' }, { deepseek: { cloneMade: true } }));
    api.handle('wallet:get', () => walletOf({ mode: 'clone' }, { deepseek: { cloneMade: made } }));
    api.handle('clone:remove', () => { made = false; return { ok: true }; });
    click(TID.models.cloneRemove('deepseek'));
    await settle();
    expect(q(TID.dialog.root)!.textContent).toContain('聊天记录和设置留着');
    click(TID.dialog.cancel);
    await settle();
    expect(api.callsOf('clone:remove')).toEqual([]);
    click(TID.models.cloneRemove('deepseek'));
    await settle();
    click(TID.dialog.confirm);
    await settle();
    expect(api.callsOf('clone:remove')).toEqual([{ vendor: 'deepseek' }]);
    expect(toastText()).toBe('删好了，聊天记录和设置留着');
    expect(q(TID.models.cloneMake('deepseek'))).toBeTruthy();
  });

  it('C-07 删除分身失败给出原因', async () => {
    await mount(walletOf({ mode: 'clone' }, { deepseek: { cloneMade: true } }));
    api.handle('clone:remove', () => ({ ok: false }));
    click(TID.models.cloneRemove('deepseek'));
    await settle();
    click(TID.dialog.confirm);
    await settle();
    expect(toastText()).toBe('没删掉');
  });

  it('C-09 离开模型页时取消订阅', async () => {
    await mount();
    expect(api.listeners('wallet')).toBe(1);
    cleanup!();
    cleanup = undefined;
    expect(api.listeners('wallet')).toBe(0);
    expect(api.listeners('step')).toBe(0);
    expect(api.listeners('browser')).toBe(0);
  });
});

describe('卡面', () => {
  it('M-01 卡面颜色和图标按厂商来', () => {
    expect(faceClass('deepseek')).toBe('face-deepseek');
    expect(faceClass('custom-x')).toBe('face-custom');
    expect(logoSrc('openai')).toBe('assets/logos/openai.webp');
    expect(logoSrc('kimi')).toBe('assets/logos/kimi.png');
    expect(logoSrc('custom-x')).toBeNull();
  });

  it('M-01 不在最上层的卡显示收费方式', async () => {
    await mount();
    expect(text('kimi')).toContain('按用量付费');
    expect(text('zhipu')).toContain('免费');
    const noop = () => {};
    const actions = { changeKey: noop, recharge: noop, retry: noop, repair: noop, reinstall: noop, swapModel: noop, tryLater: noop, pasteKey: noop, cloneMake: noop, cloneOpen: noop, cloneRemove: noop };
    const nodes = cardFace({ vendor: 'openai', name: 'OpenAI 官方账号', model: null, free: false, paid: false, keyTail: null, cloneMade: false, note: null },
      { front: false, inUse: false, state: null, cloneState: 'orig', actions });
    expect(nodes.map(n => n.textContent).join('')).not.toContain('付费');
    const noted = cardFace({ vendor: 'kimi', name: 'Kimi', model: null, free: false, paid: true, keyTail: null, cloneMade: false, note: '快到上限了' },
      { front: true, inUse: true, state: null, cloneState: 'todo', actions });
    expect(noted.map(n => n.textContent).join('')).toContain('快到上限了');
  });

  it('M-02 mountModels 也能直接挂载', () => {
    const a = fakeApi(walletOf());
    const off = mountModels(a, root, walletOf());
    expect(card('deepseek')).toBeTruthy();
    off();
  });
});
