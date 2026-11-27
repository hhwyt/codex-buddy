// @vitest-environment happy-dom
// 换新 Key 弹窗 (L3): Y-01..Y-06, design/key-rotate.html 第 3 版.
import { beforeEach, describe, expect, it } from 'vitest';
import type { CardView } from '../../electron/main/ipc-contract';
import { rotateKeyDialog, type RotateResult } from '../../ui/components/key-rotate';
import { TID } from '../../ui/testids';
import { fakeApi, flush } from './onboarding.fake';

const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (id: string) => { const el = q(id); if (!el) throw new Error(`missing ${id}`); el.click(); };
const state = (i: number) => q(TID.keyRotate.circle(i))!.dataset.state;
const states = () => [0, 1, 2].map(state);
const buttons = () => [...q(TID.keyRotate.root)!.querySelectorAll('.kr-row button')].map(b => b.textContent);

const ds: CardView = { vendor: 'deepseek', name: 'DeepSeek', model: 'deepseek-chat', free: false, paid: true, keyTail: '8f3a', cloneMade: false, note: null };
const relay: CardView = { ...ds, vendor: 'custom-relay', name: 'Relay', keyTail: '5a6d' };

type Fake = ReturnType<typeof fakeApi>;
let fake: Fake;
let answer: (args: unknown) => unknown;
let revokeAnswer: () => unknown;
let done: Promise<RotateResult>;
let release: () => void;

function open(card = ds, steps: ((f: Fake) => void) = () => {}) {
  let gate!: Promise<void>;
  release = () => {};
  gate = new Promise(r => { release = r; });
  fake = fakeApi({
    'key:replace': async args => { steps(fake); await gate; return answer(args); },
    'key:revoke': async () => revokeAnswer(),
  });
  done = rotateKeyDialog(fake.api, card);
}
const step = (id: string, st: 'start' | 'done' | 'fail', text = '') => fake.emit('step', { flow: 'key', id, state: st, text });

beforeEach(() => {
  document.body.innerHTML = '';
  answer = () => ({ ok: true });
  revokeAnswer = () => ({ ok: true });
});

describe('换新 Key 弹窗', () => {
  it('Y-01 打开：图标 + 换新 Key，旧尾号 → 新尾号占位，三个圆圈，旧 Key 会作废，先不了 / 开始换', () => {
    open();
    const root = q(TID.keyRotate.root)!;
    expect(root.querySelector('h2')!.textContent).toBe('换新 Key');
    expect(root.querySelector('h2 img')!.getAttribute('src')).toBe('assets/logos/deepseek.png');
    expect(root.querySelector('.kr-swap')!.textContent).toBe('sk-••••8f3a→sk-••••····');
    expect([0, 1, 2].map(i => q(TID.keyRotate.circle(i))!.textContent)).toEqual(['新建 Key', '测试连通', '作废旧 Key']);
    expect(states()).toEqual(['idle', 'idle', 'idle']);
    expect(buttons()).toEqual(['先不了', '开始换']);
    expect(root.textContent).toContain('旧 Key 会作废');
    expect(q(TID.keyRotate.paste)).toBeNull();
  });

  it('Y-01 先不了 / Esc / 点外面：关掉，什么都没换', async () => {
    open();
    click(TID.keyRotate.cancel);
    expect(await done).toEqual({ changed: false, outcome: undefined });
    open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect((await done).changed).toBe(false);
    open();
    (document.querySelector('.kr-scrim') as HTMLElement).click();
    expect((await done).changed).toBe(false);
    expect(fake.invoke).not.toHaveBeenCalled();
  });

  it('Y-01 自定义厂商：粘贴框，三个圆圈是粘贴新 Key / 测试连通 / 保存，粘了才能开始，不写会作废', async () => {
    open(relay);
    expect([0, 1, 2].map(i => q(TID.keyRotate.circle(i))!.textContent)).toEqual(['粘贴新 Key', '测试连通', '保存']);
    expect(q(TID.keyRotate.root)!.textContent).not.toContain('旧 Key 会作废');
    expect(q(TID.keyRotate.root)!.querySelector('.kr-logo b')!.textContent).toBe('R');
    const start = q(TID.keyRotate.start) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    const paste = q(TID.keyRotate.paste) as HTMLInputElement;
    paste.value = '  sk-relay-new-0000NEW7 ';
    paste.dispatchEvent(new Event('input'));
    expect(start.disabled).toBe(false);
    start.click();
    release();
    await flush();
    expect(fake.invoke).toHaveBeenCalledWith('key:replace', { vendor: 'custom-relay', key: 'sk-relay-new-0000NEW7' });
  });

  it('Y-06 Y-02 三步跟着主进程走：登录时等着并说在哪做；新尾号出现；看明细只有尾号；做完「好」', async () => {
    open();
    click(TID.keyRotate.start);
    expect(buttons()).toEqual([]);
    step('new', 'start');
    expect(states()).toEqual(['now', 'idle', 'idle']);
    step('new', 'start', '在右边的官方页面点「创建」');
    expect(state(0)).toBe('wait');
    expect(q(TID.keyRotate.msg)!.textContent).toBe('在右边的官方页面点「创建」');
    step('new', 'done', 'sk-••••NEW1');
    expect(q(TID.keyRotate.newTail)!.textContent).toBe('sk-••••NEW1');
    expect(q(TID.keyRotate.newTail)!.classList.contains('roll')).toBe(true);
    step('test', 'start');
    step('backup', 'done', '备份好了');
    step('test', 'done');
    step('revoke', 'start');
    expect(states()).toEqual(['done', 'done', 'now']);
    expect((q(TID.keyRotate.root)!.querySelector('.kr-line i') as HTMLElement).style.width).toBe('100%');
    // Esc does nothing while it runs
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(q(TID.keyRotate.root)).toBeTruthy();
    fake.emit('step', { flow: 'switch', id: 'new', state: 'fail', text: '别的流程' });
    step('revoke', 'done');
    answer = () => ({ ok: true, restartRequired: true });
    release();
    await flush();
    expect(states()).toEqual(['done', 'done', 'done']);
    expect(q(TID.keyRotate.log)!.hidden).toBe(true);
    click(TID.keyRotate.more);
    expect(q(TID.keyRotate.log)!.hidden).toBe(false);
    expect(q(TID.keyRotate.more)!.textContent).toBe('收起 ▴');
    expect(q(TID.keyRotate.log)!.textContent).toBe('新建 Key：在右边的官方页面点「创建」新建 Key：sk-••••NEW1备份好了');
    click(TID.keyRotate.more);
    expect(q(TID.keyRotate.log)!.hidden).toBe(true);
    expect(buttons()).toEqual(['好']);
    click(TID.keyRotate.ok);
    expect(await done).toEqual({ changed: true, outcome: { ok: true, restartRequired: true } });
    expect(fake.count('step')).toBe(0);
  });

  it('Y-03 测不通：停在第二个圈，红字写原因、还在用原来的 Key；去社群咨询 + 关掉 + 再试一次', async () => {
    open();
    click(TID.keyRotate.start);
    step('new', 'done', 'sk-••••BAD4');
    step('test', 'fail', '新 Key 测不通');
    answer = () => ({ ok: false, kind: 'key-test', reason: '新 Key 测不通' });
    release();
    await flush();
    expect(states()).toEqual(['done', 'fail', 'idle']);
    expect(q(TID.keyRotate.msg)!.textContent).toBe('新 Key 测不通，还在用原来的 Key');
    expect(q(TID.keyRotate.msg)!.classList.contains('err')).toBe(true);
    expect(q(TID.help)).toBeTruthy();
    expect(buttons()).toEqual(['去社群咨询', '关掉', '再试一次']);
    // 再试一次 starts over
    answer = () => ({ ok: true });
    click(TID.keyRotate.retry);
    expect(states()).toEqual(['idle', 'idle', 'idle']);
    release();
    await flush();
    expect(fake.invoke).toHaveBeenCalledTimes(2);
    expect(buttons()).toEqual(['好']);
  });

  it('Y-02 登录时关掉浏览器：取消，不带社群；没发事件也失败的话第一个没完成的圈打叉；调用出错也算没换', async () => {
    open();
    click(TID.keyRotate.start);
    answer = () => ({ ok: false, kind: 'cancelled', reason: '取消了' });
    release();
    await flush();
    expect(states()).toEqual(['fail', 'idle', 'idle']);
    expect(q(TID.keyRotate.msg)!.textContent).toBe('取消了，还在用原来的 Key');
    expect(q(TID.keyRotate.msg)!.classList.contains('err')).toBe(false);
    expect(buttons()).toEqual(['关掉', '再试一次']);
    click(TID.keyRotate.close);
    expect(await done).toEqual({ changed: false, outcome: undefined });

    open();
    click(TID.keyRotate.start);
    answer = () => { throw new Error('boom'); };
    release();
    await flush();
    expect(q(TID.keyRotate.msg)!.textContent).toBe('没换成，还在用原来的 Key');
    click(TID.keyRotate.close);
    open(ds);
    click(TID.keyRotate.start);
    answer = () => ({ ok: false });
    release();
    await flush();
    expect(q(TID.keyRotate.msg)!.textContent).toBe('没换成，还在用原来的 Key');
  });

  it('Y-05 旧 Key 还能用：第三个圈打叉，去官网删再等；删好了打勾；还没删就还是叉', async () => {
    open();
    click(TID.keyRotate.start);
    step('new', 'done', 'sk-••••NEW2');
    step('test', 'done');
    step('revoke', 'start', '在右边删掉 sk-••••OLD2');
    expect(state(2)).toBe('wait');
    expect(q(TID.keyRotate.msg)!.textContent).toBe('在右边删掉 sk-••••OLD2');
    step('revoke', 'fail', '旧 Key 还能用');
    answer = () => ({ ok: true, revokePending: true });
    release();
    await flush();
    expect(states()).toEqual(['done', 'done', 'fail']);
    expect(q(TID.keyRotate.msg)!.textContent).toBe('旧 Key 还能用');
    expect(buttons()).toEqual(['关掉', '去官网删']);
    revokeAnswer = () => ({ ok: false, kind: 'revoke-pending', reason: '旧 Key 还能用' });
    click(TID.keyRotate.revoke);
    await flush();
    expect(fake.invoke).toHaveBeenLastCalledWith('key:revoke', { vendor: 'deepseek' });
    expect(buttons()).toEqual(['关掉', '去官网删']);
    revokeAnswer = () => { throw new Error('x'); };
    click(TID.keyRotate.revoke);
    await flush();
    expect(buttons()).toEqual(['关掉', '去官网删']);
    revokeAnswer = () => ({ ok: true });
    click(TID.keyRotate.revoke);
    await flush();
    expect(states()).toEqual(['done', 'done', 'done']);
    click(TID.keyRotate.ok);
    expect((await done).changed).toBe(true);
  });

  it('Y-05 旧 Key 还能用时关掉：新 Key 已经在用，算换了', async () => {
    open();
    click(TID.keyRotate.start);
    answer = () => ({ ok: true, revokePending: true });
    release();
    await flush();
    click(TID.keyRotate.close);
    expect(await done).toEqual({ changed: true, outcome: { ok: true, revokePending: true } });
  });

  it('Y-05 右侧浏览器展开时弹窗放在它左边（挂在 App 根上）', () => {
    const app = document.createElement('div');
    app.className = 'browser-expanded';
    app.append(Object.assign(document.createElement('div'), { className: 'browser-host' }));
    document.body.append(app);
    open();
    expect(document.querySelector('.kr-scrim')!.parentElement).toBe(app);
  });
});
