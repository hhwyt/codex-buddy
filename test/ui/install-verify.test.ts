// @vitest-environment happy-dom
// Install with the check (L3): A-01..A-06, design/install-verify.html#v2.
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../../ui/app';
import { renderInstallVerify } from '../../ui/pages/install-verify';
import { TID } from '../../ui/testids';
import { walletOf } from './models-fake';
import { appState, fakeApi, settle } from './settings.fake';

const get = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (id: string) => { const el = get(id); if (!el) throw new Error(`missing ${id}`); el.click(); };
const title = () => get(TID.verify.title)?.textContent ?? '';
const tick = () => { const box = get(TID.verify.star) as HTMLInputElement; box.checked = true; box.dispatchEvent(new Event('change')); };
const rowState = (id: string) => get(TID.onboarding.step(id))?.dataset.state;
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };

beforeEach(() => { document.body.replaceChildren(); document.documentElement.classList.add('os-mac'); });
afterEach(() => { document.body.replaceChildren(); document.documentElement.classList.remove('os-mac'); });

type Answers = Parameters<typeof fakeApi>[0];
function mount(answers: Answers = {}) {
  const fake = fakeApi({ 'wallet:get': walletOf(), ...answers });
  const root = document.createElement('div');
  document.body.append(root);
  const went: string[] = [];
  const dispose = renderInstallVerify({ api: fake.api, root, go: r => { went.push(r); } });
  return { fake, went, dispose };
}

describe('一个弹窗走完安装和验证', () => {
  test('A-01 开关打开：点开始安装只出现这一个弹窗；开关关着还是原来的安装抽屉', async () => {
    for (const on of [true, false]) {
      document.body.replaceChildren();
      const fake = fakeApi({ 'app:state': appState({ codexInstalled: false, starVerify: on }), 'install:run': () => new Promise(() => {}) });
      const root = document.createElement('div');
      document.body.append(root);
      await createApp(root, fake.api);
      get(TID.onboarding.start)!.click();
      await settle();
      expect(!!get(TID.verify.root)).toBe(on);
      expect(!!get(TID.onboarding.root)).toBe(!on);
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    }
  });

  test('A-01 四步依次：下载、装进应用程序、检查、测试 Codex（下面写尝试打开本项目的 GitHub Repo）', async () => {
    const install = deferred<{ ok: boolean }>();
    const { fake } = mount({ 'install:run': () => install.promise });
    await settle();
    expect(title()).toBe('正在安装');
    const rows = [...document.querySelectorAll('.progress-row')].map(r => r.textContent);
    expect(rows).toEqual(['下载 Codex', '装进应用程序', '检查 Codex', '测试 Codex']);
    fake.emit('step', { flow: 'install', id: 'download', state: 'done', text: '下载 Codex' });
    expect(rowState('download')).toBe('done');
    install.resolve({ ok: true });
    await settle();
    expect(fake.called('switch:start').map(c => c.args)).toEqual([{ vendor: 'deepseek' }]);
    expect(fake.called('verify:run')).toHaveLength(1);
    expect(fake.called('verify:open-repo')).toHaveLength(1);
    expect(rowState('test')).toBe('done');
    expect(get(TID.verify.test)?.textContent).toBe('尝试打开本项目的 GitHub Repo');
    expect(title()).toBe('✓装好了');
  });

  test('A-02 第 4 步失败：一句原因 +「稍后再试」「重试」，重试只重做第 4 步', async () => {
    let n = 0;
    const { fake, went } = mount({ 'verify:run': () => (++n === 1 ? { ok: false, reason: 'DeepSeek 说 Key 不对' } : { ok: true }) });
    await settle();
    expect(title()).toBe('✕没装好');
    expect(rowState('test')).toBe('fail');
    expect(get(TID.verify.reason)?.textContent).toBe('DeepSeek 说 Key 不对');
    expect(fake.called('verify:open-repo')).toHaveLength(0);
    click(TID.verify.retry);
    await settle();
    expect(fake.called('install:run')).toHaveLength(1);
    expect(fake.called('switch:start')).toHaveLength(2);
    expect(title()).toBe('✓装好了');
    expect(went).toEqual([]);
  });

  test('A-02 配不上第一张卡、安装失败：同样给原因；稍后再试回到模型页', async () => {
    const { went } = mount({ 'install:run': { ok: false, reason: '下载没成功，检查一下网络再试' } });
    await settle();
    expect(get(TID.verify.reason)?.textContent).toBe('下载没成功，检查一下网络再试');
    expect(get(TID.verify.retry)?.textContent).toBe('再试一次');
    click(TID.verify.later);
    expect(went).toEqual(['models']);
    const second = mount({ 'switch:start': { ok: false, reason: '没拿到 Key' } });
    await settle();
    expect(document.querySelectorAll(`[data-testid="${TID.verify.reason}"]`)[1]?.textContent).toBe('没拿到 Key');
    second.dispose();
  });

  test('A-03 页面打开时弹窗变宽，浏览器放进右半边；关弹窗时一起关', async () => {
    const { fake, went } = mount();
    await settle();
    // pinned hidden before the switch, again before the GitHub page
    expect(fake.called('browser:place').map(c => c.args)).toEqual([{ x: 0, y: 0, width: 0, height: 0 }, { x: 0, y: 0, width: 0, height: 0 }]);
    fake.emit('browser', { open: true, mode: 'inline', url: 'https://github.com/hhwyt/codex-buddy', canGoBack: false, width: 0 });
    expect(get(TID.verify.root)?.classList.contains('wide')).toBe(true);
    await new Promise(r => requestAnimationFrame(() => r(null)));
    expect(fake.called('browser:place')).toHaveLength(3);
    click(TID.verify.close);
    expect(fake.called('browser:close')).toHaveLength(1);
    expect(went).toEqual(['models']);
  });

  test('A-03 GitHub 页面没打开：第 4 步照样打勾，下面说没打开', async () => {
    mount({ 'verify:open-repo': { ok: false } });
    await settle();
    expect(rowState('test')).toBe('done');
    expect(get(TID.verify.test)?.textContent).toBe('GitHub 页面没打开，可能是网络问题');
  });

  test('A-04 勾选框不默认勾上，不勾不点', async () => {
    const { fake } = mount();
    await settle();
    const box = get(TID.verify.star) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.closest('label')?.textContent).toBe('给 CodexBuddy 点个 Star');
    click(TID.verify.close);
    expect(fake.called('star:run')).toHaveLength(0);
  });

  test('A-05 安装中就勾上：第 4 步做完才点；点好只显示「✓ 已点 Star」', async () => {
    const install = deferred<{ ok: boolean }>();
    const star = deferred<{ ok: boolean }>();
    const { fake } = mount({ 'install:run': () => install.promise, 'star:run': () => star.promise });
    await settle();
    tick();
    await settle();
    expect(fake.called('star:run')).toHaveLength(0);
    install.resolve({ ok: true });
    await settle();
    expect(fake.called('star:run')).toHaveLength(1);
    expect(document.querySelector('.verify-star')?.textContent).toBe('正在点 Star');
    star.resolve({ ok: true });
    await settle();
    expect(get(TID.verify.starDone)?.textContent).toBe('✓已点 Star');
  });

  test('A-05 没点上：说原因，勾选框退回；登录被取消不报错', async () => {
    let n = 0;
    mount({ 'star:run': () => (++n === 1 ? { ok: false, reason: '没找到 Star 按钮，可以在右边自己点' } : { ok: false, kind: 'cancelled', reason: '没登录 GitHub' }) });
    await settle();
    tick();
    await settle();
    expect(document.querySelector('.verify-star .verify-reason')?.textContent).toBe('没找到 Star 按钮，可以在右边自己点');
    expect((get(TID.verify.star) as HTMLInputElement).checked).toBe(false);
    tick();
    await settle();
    expect(document.querySelector('.verify-star .verify-reason')).toBeNull();
  });

  test('A-06 最后在同一个弹窗里打开 ChatGPT，写清会中断任务；运行中改成重启；失败可再试', async () => {
    let tries = 0;
    const { fake, went } = mount({ 'codex:restart': () => (++tries === 1 ? { ok: false } : { ok: true }) });
    await settle();
    expect(get(TID.verify.open)?.textContent).toBe('打开 ChatGPT');
    expect(get(TID.verify.root)?.textContent).toContain('如果 ChatGPT 已在运行，会先退出再打开，正在进行的任务会中断。');
    click(TID.verify.open);
    await settle();
    expect(get(TID.verify.open)?.textContent).toBe('再试一次');
    expect(get(TID.verify.root)?.textContent).toContain('请先保存任务并退出 ChatGPT，再试一次。');
    click(TID.verify.open);
    await settle();
    expect(fake.called('codex:restart')).toHaveLength(2);
    expect(went).toEqual(['models']);
    document.body.replaceChildren();
    mount({ 'switch:start': { ok: true, restartRequired: true } });
    await settle();
    expect(get(TID.verify.open)?.textContent).toBe('重启 ChatGPT');
  });
});
