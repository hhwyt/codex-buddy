// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Outcome, StepView } from '../../electron/main/ipc-contract';
import { maskKeys, renderOnboarding } from '../../ui/pages/onboarding';
import { byTestId } from '../../ui/dom';
import { TID } from '../../ui/testids';
import { fakeApi, flush } from './onboarding.fake';

const step = (id: string, state: StepView['state'], text: string): StepView => ({ flow: 'install', id, state, text });

let root: HTMLElement;
beforeEach(() => { document.body.replaceChildren(); document.head.replaceChildren(); root = document.createElement('div'); document.body.append(root); });
afterEach(() => { vi.restoreAllMocks(); });

function setup(install: () => Promise<Outcome> | Outcome, log = '') {
  const f = fakeApi({ 'install:run': install, 'install:log': () => ({ text: log }) });
  const go = vi.fn();
  const cleanup = renderOnboarding({ api: f.api, root, go }) as () => void;
  return { ...f, go, cleanup };
}
const get = (id: string) => byTestId(document.body, id)!;

describe('onboarding', () => {
  test('O-01 欢迎屏只有标题和「开始安装」', () => {
    setup(() => ({ ok: true }));
    const view = get(TID.onboarding.root);
    expect(view.textContent).toBe('开始安装');
    expect(get(TID.onboarding.start).className).toContain('primary');
    expect(readFileSync('ui/index.html', 'utf8')).toContain('href="onboarding.css"');
  });

  test('O-01 安装中：圆环、标题、步骤列表从上到下居中；没装好时标题和步骤靠左', async () => {
    let fail!: (o: Outcome) => void;
    setup(() => new Promise<Outcome>(r => { fail = r; }));
    get(TID.onboarding.start).click();
    await flush();
    const col = document.querySelector('.onb-steps')!;
    expect([...col.children].map(c => c.className)).toEqual(['progress-ring', 'onb-head', 'progress', 'onb-fixing']);
    expect(get(TID.onboarding.ring).textContent).toBe('0%');
    const css = readFileSync('ui/onboarding.css', 'utf8');
    expect(css).toMatch(/\.onb-steps \{[^}]*align-items: center[^}]*text-align: center/);
    fail({ ok: false, reason: 'x' } as Outcome);
    await flush();
    expect(document.querySelector('.onb-failure .onb-head + .progress')).not.toBeNull();
    expect(css).toMatch(/\.onb-failure \{[^}]*align-items: flex-start[^}]*text-align: left/);
  });

  test('O-01 点「开始安装」→ 进度依次打勾 → 进模型页', async () => {
    let finish!: (o: Outcome) => void;
    const f = setup(() => new Promise(r => { finish = r; }));
    get(TID.onboarding.start).click();
    expect(byTestId(root, TID.onboarding.start)).toBeNull();
    f.emit('step', step('check', 'start', '检测电脑'));
    expect(get(TID.onboarding.step('check')).dataset.state).toBe('start');
    f.emit('step', step('check', 'done', '检测电脑'));
    f.emit('step', step('codex', 'start', '安装 Codex'));
    f.emit('step', step('codex', 'done', '安装 Codex'));
    f.emit('step', { flow: 'switch', id: 'other', state: 'start', text: '别的流程' });
    const rows = [...root.querySelectorAll('.progress-row')] as HTMLElement[];
    expect(rows.map(r => r.dataset.state)).toEqual(['done', 'done']);
    expect(rows[0].textContent).toBe('✓检测电脑');
    expect(f.go).not.toHaveBeenCalled();
    finish({ ok: true });
    await flush();
    expect(f.go).toHaveBeenCalledWith('models');
    expect(f.invoke).toHaveBeenCalledTimes(1);
  });

  test('O-01 安装中再点不会重复开始', async () => {
    let finish!: (o: Outcome) => void;
    const f = setup(() => new Promise(r => { finish = r; }));
    const start = get(TID.onboarding.start);
    start.click();
    start.click();
    expect(f.invoke).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    await flush();
  });

  test('O-02 已经装了 Codex：那一行直接显示「已装好」', async () => {
    const f = setup(() => new Promise(() => {}));
    get(TID.onboarding.start).click();
    f.emit('step', step('codex', 'done', '已装好'));
    const row = get(TID.onboarding.step('codex'));
    expect(row.dataset.state).toBe('done');
    expect(row.textContent).toContain('已装好');
  });

  test('O-08 安装中自动修小问题，显示「正在帮你修：…」，修好就收起', () => {
    const f = setup(() => new Promise(() => {}));
    get(TID.onboarding.start).click();
    const fixing = get(TID.onboarding.fixing);
    expect(fixing.hidden).toBe(true);
    f.emit('step', step('fix-catalog', 'start', '模型菜单文件'));
    expect(fixing.hidden).toBe(false);
    expect(fixing.textContent).toBe('正在帮你修：模型菜单文件');
    expect(byTestId(root, TID.onboarding.step('fix-catalog'))).toBeNull();
    f.emit('step', step('fix-catalog', 'done', '模型菜单文件'));
    expect(fixing.hidden).toBe(true);
  });

  test('O-03 安装失败 → 故障屏 →「再试一次」从失败的那一步接着做', async () => {
    const outcomes: Outcome[] = [{ ok: false, reason: '网络断了，下载没完成' }, { ok: true }];
    const f = setup(() => outcomes.shift()!);
    get(TID.onboarding.start).click();
    f.emit('step', step('check', 'done', '检测电脑'));
    f.emit('step', step('codex', 'fail', '安装 Codex'));
    await flush();
    const failure = get(TID.onboarding.failure);
    expect(failure.textContent).toContain('网络断了，下载没完成');
    expect(get(TID.onboarding.step('check')).dataset.state).toBe('done');
    expect(get(TID.onboarding.retry).className).toContain('primary');
    get(TID.onboarding.retry).click();
    expect(byTestId(root, TID.onboarding.failure)).toBeNull();
    // the ticked row stays; main resumes at the failed one
    expect(get(TID.onboarding.step('check')).dataset.state).toBe('done');
    f.emit('step', step('codex', 'done', '安装 Codex'));
    await flush();
    expect(f.invoke.mock.calls.filter(c => c[0] === 'install:run')).toHaveLength(2);
    expect(f.go).toHaveBeenCalledWith('models');
  });

  test('O-03 主进程出错没给原因 → 故障屏写默认原因', async () => {
    setup(() => { throw new Error('boom'); });
    get(TID.onboarding.start).click();
    await flush();
    expect(get(TID.onboarding.failure).textContent).toContain('安装没完成，请再试一次');
  });

  test('O-04 故障屏「复制日志」：先预览，Key 已打码，确认后才复制', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup(() => ({ ok: false }), 'POST https://api.deepseek.com key=sk-abcdef1234567890\nAuthorization: Bearer abcdefghijkl');
    get(TID.onboarding.start).click();
    await flush();
    get(TID.onboarding.copyLog).click();
    await flush();
    const preview = get(TID.onboarding.logPreview);
    expect(preview.textContent).toContain('sk-••••');
    expect(preview.textContent).not.toContain('abcdef1234567890');
    expect(preview.textContent).not.toContain('abcdefghijkl');
    expect(writeText).not.toHaveBeenCalled();
    get(TID.dialog.confirm).click();
    await flush();
    expect(writeText).toHaveBeenCalledWith(preview.textContent);
    expect(get(TID.toast).textContent).toBe('已复制');
  });

  test('O-04 预览后点「先不了」不复制', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup(() => ({ ok: false }), 'log');
    get(TID.onboarding.start).click();
    await flush();
    get(TID.onboarding.copyLog).click();
    await flush();
    get(TID.dialog.cancel).click();
    await flush();
    expect(writeText).not.toHaveBeenCalled();
  });

  test('O-04 剪贴板不可用 → 红色提示「没复制成功」', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } }, configurable: true });
    setup(() => ({ ok: false }), 'log');
    get(TID.onboarding.start).click();
    await flush();
    get(TID.onboarding.copyLog).click();
    await flush();
    get(TID.dialog.confirm).click();
    await flush();
    const t = get(TID.toast);
    expect(t.textContent).toBe('没复制成功');
    expect(t.className).toContain('error');
  });

  test('O-05 故障屏「进群发给我们」→ 社群页', async () => {
    const f = setup(() => ({ ok: false }));
    get(TID.onboarding.start).click();
    await flush();
    get(TID.onboarding.toCommunity).click();
    expect(f.go).toHaveBeenCalledWith('community');
  });

  test('O-07 离开引导后不再响应进度，也不再跳页', async () => {
    let finish!: (o: Outcome) => void;
    const f = setup(() => new Promise(r => { finish = r; }));
    get(TID.onboarding.start).click();
    expect(f.count('step')).toBe(1);
    f.cleanup();
    expect(f.count('step')).toBe(0);
    finish({ ok: true });
    await flush();
    expect(f.go).not.toHaveBeenCalled();
  });

  test('O-04 maskKeys 把像 Key 的东西都打码', () => {
    expect(maskKeys('sk-1234567890ab')).toBe('sk-••••');
    expect(maskKeys('"api_key": "abcdefgh12345"')).toBe('"api_key": "••••"');
    expect(maskKeys('token=abcdefgh1')).toBe('token=••••');
    expect(maskKeys('Bearer zzzzzzzzzz')).toBe('Bearer ••••');
    expect(maskKeys('普通的一行')).toBe('普通的一行');
  });
});
