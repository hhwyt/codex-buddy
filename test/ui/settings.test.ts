// @vitest-environment happy-dom
// L3: settings page (T-01..T-03, L-01..L-07, U-04). Owner: A6.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { motion, renderSettings } from '../../ui/pages/settings';
import { TID } from '../../ui/testids';
import { appState, click, fakeApi, settle } from './settings.fake';

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const words = (card: string) => [...$(card)!.querySelectorAll<HTMLElement>('.w')].map(w => w.textContent);
const msg = () => document.querySelector('.lang-msg')!.textContent ?? '';
const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent === label) ?? null;

async function mount(fake: ReturnType<typeof fakeApi>, go = vi.fn()) {
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.getElementById('root')!;
  await renderSettings({ api: fake.api, root, go });
  return { root, go };
}

/** Records the order in which preview lines change text */
function watchOrder(card: string): string[] {
  const order: string[] = [];
  new MutationObserver(ms => {
    for (const m of ms) {
      const el = (m.target.nodeType === 1 ? m.target : m.target.parentElement) as HTMLElement;
      if (el?.classList?.contains('w') && m.type === 'childList' && !order.includes(el.dataset.e!)) order.push(el.dataset.e!);
    }
  }).observe($(card)!, { childList: true, subtree: true, characterData: true });
  return order;
}

beforeEach(() => { Object.assign(motion, { lineMs: 0, gapMs: 0, settleMs: 0, flyMs: 0 }); localStorage.clear(); });
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('汉化（L）', () => {
  it('L-01 默认英文原版：英文卡选中，汉化卡没有垃圾桶', async () => {
    await mount(fakeApi());
    expect($(TID.settings.enCard)!.classList.contains('on')).toBe(true);
    expect($(TID.settings.zhCard)!.classList.contains('on')).toBe(false);
    expect($(TID.settings.zhTrash)).toBeNull(); // only there while the launcher exists
    expect(words(TID.settings.enCard)).toContain('New chat');
    expect(words(TID.settings.zhCard)).toContain('新对话');
  });

  it('L-01 已经是汉化版时打开设置，汉化卡选中、垃圾桶在', async () => {
    await mount(fakeApi({ 'app:state': appState({ zh: { on: true, launcherExists: true, supported: true, hidden: false } }) }));
    expect($(TID.settings.zhCard)!.classList.contains('on')).toBe(true);
    expect($(TID.settings.zhTrash)).not.toBeNull();
  });

  it('L-02 点汉化版：字从上往下一行行变中文，第一次加上图标，没有确认框', async () => {
    const fake = fakeApi({ 'zh:set': { ok: true } });
    await mount(fake);
    click($(TID.settings.zhCard));
    const order = watchOrder(TID.settings.zhCard); // after the instant reset to English
    expect(words(TID.settings.zhCard)[0]).toBe('New chat'); // starts from English
    expect(msg()).toContain('正在换成中文');
    await settle(80);
    expect(words(TID.settings.zhCard)).toEqual(['新对话', '技能', '自动化', '设置', '我们来构建点什么', '向 Codex 提问…']);
    expect(order).toEqual(['New chat', 'Skills', 'Automations', 'Settings', "Let's build", 'Ask Codex anything…']);
    expect(fake.called('zh:set')[0].args).toEqual({ on: true });
    expect($(TID.settings.zhCard)!.classList.contains('on')).toBe(true);
    expect($(TID.settings.zhTrash)).not.toBeNull();
    expect(msg()).toContain('好了：从「ChatGPT 汉化版」打开就是中文');
    expect($(TID.dialog.root)).toBeNull();
    click(button('打开看看'));
    expect(fake.called('codex:open')).toHaveLength(1);
  });

  it('L-02 正在切的时候再点不会重复切', async () => {
    const fake = fakeApi({ 'zh:set': { ok: true } });
    await mount(fake);
    click($(TID.settings.zhCard));
    click($(TID.settings.zhCard));
    click($(TID.settings.enCard));
    await settle(80);
    expect(fake.called('zh:set')).toHaveLength(1);
    click($(TID.settings.zhCard)); // already zh: nothing
    await settle(10);
    expect(fake.called('zh:set')).toHaveLength(1);
  });

  it('L-02 键盘回车也能选汉化版', async () => {
    const fake = fakeApi({ 'zh:set': { ok: true } });
    await mount(fake);
    $(TID.settings.zhCard)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    $(TID.settings.zhCard)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    await settle(80);
    expect(fake.called('zh:set')).toHaveLength(1);
  });

  it('L-03 点英文原版：字从下往上倒回英文，汉化版图标留着', async () => {
    const fake = fakeApi({ 'app:state': appState({ zh: { on: true, launcherExists: true, supported: true, hidden: false } }), 'zh:set': { ok: true } });
    await mount(fake);
    click($(TID.settings.enCard));
    const order = watchOrder(TID.settings.enCard);
    expect(words(TID.settings.enCard)[0]).toBe('新对话');
    await settle(80);
    expect(words(TID.settings.enCard)[0]).toBe('New chat');
    expect(order).toEqual(['Ask Codex anything…', "Let's build", 'Settings', 'Automations', 'Skills', 'New chat']);
    expect(fake.called('zh:set')[0].args).toEqual({ on: false });
    expect($(TID.settings.enCard)!.classList.contains('on')).toBe(true);
    expect($(TID.settings.zhTrash)).not.toBeNull();
    expect(msg()).toContain('图标还留着');
  });

  it('L-07 切回英文时告诉用户分身也变回英文', async () => {
    const fake = fakeApi({ 'app:state': appState({ zh: { on: true, launcherExists: true, supported: true, hidden: false } }) });
    await mount(fake);
    click($(TID.settings.enCard));
    await settle(80);
    expect(msg()).toContain('分身也变回英文');
  });

  it('L-04 垃圾桶在汉化版预览框右下角、不配文字，悬停写「去掉汉化版」，英文卡上没有', async () => {
    await mount(fakeApi({ 'app:state': appState({ zh: { on: false, launcherExists: true, supported: true, hidden: false } }) }));
    const trash = $(TID.settings.zhTrash)!;
    expect(trash.closest('.shot')!.closest(`[data-testid="${TID.settings.zhCard}"]`)).not.toBeNull();
    expect($(TID.settings.enCard)!.querySelector('.trash')).toBeNull();
    expect(trash.title).toBe('去掉汉化版');
    expect(trash.querySelector('.tip')!.textContent).toBe('去掉汉化版');
    expect(trash.textContent).toBe('去掉汉化版'); // only the hover tip, no label next to it
  });

  it('L-04 点垃圾桶：图标飞进废纸篓，只调去掉汉化版，垃圾桶消失', async () => {
    const fake = fakeApi({ 'app:state': appState({ zh: { on: false, launcherExists: true, supported: true, hidden: false } }), 'zh:remove': { ok: true } });
    await mount(fake);
    motion.flyMs = 20;
    click($(TID.settings.zhTrash));
    await settle(2);
    expect(document.querySelector('.flyer')).not.toBeNull();
    expect(document.querySelector('.flyer i')!.textContent).toBe('中');
    await new Promise(r => setTimeout(r, 40));
    await settle();
    expect(document.querySelector('.flyer')).toBeNull();
    expect(fake.called('zh:remove')).toHaveLength(1);
    expect(fake.called('zh:set')).toHaveLength(0);
    expect(fake.called('restore:run')).toHaveLength(0);
    expect($(TID.settings.zhTrash)).toBeNull(); // only there while the launcher exists
    expect(msg()).toContain('Codex 和聊天记录都没动');
  });

  it('L-04 汉化版正在用时点垃圾桶：先切回英文再去掉图标', async () => {
    const fake = fakeApi({ 'app:state': appState({ zh: { on: true, launcherExists: true, supported: true, hidden: false } }) });
    await mount(fake);
    click($(TID.settings.zhTrash));
    await settle(100);
    expect(fake.calls.map(c => c.channel).filter(c => c.startsWith('zh:'))).toEqual(['zh:set', 'zh:remove']);
    expect($(TID.settings.enCard)!.classList.contains('on')).toBe(true);
  });

  it('L-04 切回英文失败时不去掉图标', async () => {
    const fake = fakeApi({ 'app:state': appState({ zh: { on: true, launcherExists: true, supported: true, hidden: false } }), 'zh:set': { ok: false, reason: '没切回去' } });
    await mount(fake);
    click($(TID.settings.zhTrash));
    await settle(100);
    expect(fake.called('zh:remove')).toHaveLength(0);
    expect(msg()).toContain('没切回去');
  });

  it('L-04 去不掉时提示，「重试」重新去掉；正在去的时候再点不重复', async () => {
    let n = 0;
    const fake = fakeApi({ 'app:state': appState({ zh: { on: false, launcherExists: true, supported: true, hidden: false } }), 'zh:remove': () => ({ ok: ++n > 1 }) });
    await mount(fake);
    click($(TID.settings.zhTrash));
    click($(TID.settings.zhTrash));
    await settle();
    expect(fake.called('zh:remove')).toHaveLength(1);
    expect(msg()).toContain('图标没去掉');
    expect($(TID.settings.zhTrash)).not.toBeNull();
    click(button('重试'));
    await settle();
    expect(fake.called('zh:remove')).toHaveLength(2);
    expect($(TID.settings.zhTrash)).toBeNull(); // only there while the launcher exists
  });

  it('L-05 语言保存后确认重启，稍后不退出，确认调用重启', async () => {
    const fake = fakeApi({ 'zh:set': { ok: true, restartRequired: true } });
    await mount(fake);
    click($(TID.settings.zhCard));
    await settle(80);
    expect($(TID.restart.root)!.textContent).toContain('现在重启 ChatGPT？');
    click($(TID.restart.later));
    await settle();
    expect(fake.called('codex:restart')).toHaveLength(0);
    click($(TID.settings.enCard));
    await settle(80);
    click($(TID.restart.now));
    await settle();
    expect(fake.called('codex:restart')).toHaveLength(1);
    expect(fake.called('codex:open')).toHaveLength(0);
  });

  it('L-05 Codex 没开着时不问', async () => {
    await mount(fakeApi({ 'zh:set': { ok: true, needsReopen: false } }));
    click($(TID.settings.zhCard));
    await settle(80);
    expect(button('重新打开')).toBeNull();
  });

  it('L-06 这一版汉化不了：退回英文原版，Codex 照常能用', async () => {
    await mount(fakeApi({ 'zh:set': { ok: false, reason: 'enable_i18n missing' } }));
    click($(TID.settings.zhCard));
    await settle(80);
    expect($(TID.settings.enCard)!.classList.contains('on')).toBe(true);
    expect($(TID.settings.zhCard)!.classList.contains('on')).toBe(false);
    expect(msg()).toContain('暂时汉化不了，已经退回英文原版，Codex 照常能用');
    expect($(TID.settings.zhTrash)).toBeNull(); // only there while the launcher exists
    click(button('知道了'));
    expect(msg()).toBe('');
  });

  it('T-01 切回英文失败时提示原因，「重试」重新切', async () => {
    let n = 0;
    const fake = fakeApi({ 'app:state': appState({ zh: { on: true, launcherExists: true, supported: true, hidden: false } }), 'zh:set': () => (++n > 1 ? { ok: true } : { ok: false }) });
    await mount(fake);
    click($(TID.settings.enCard));
    await settle(80);
    expect($(TID.settings.zhCard)!.classList.contains('on')).toBe(true);
    expect(msg()).toContain('没切回英文原版');
    click(button('重试'));
    await settle(80);
    expect($(TID.settings.enCard)!.classList.contains('on')).toBe(true);
  });

  it('U-04 远程开关隐藏汉化入口时，设置页没有这一块', async () => {
    await mount(fakeApi({ 'app:state': appState({ zh: { on: false, launcherExists: false, supported: false, hidden: true } }) }));
    expect($(TID.settings.zhCard)).toBeNull();
    expect($(TID.settings.version)).not.toBeNull();
  });
});

describe('版本和检查更新（T-02）', () => {
  it('T-02 显示版本号', async () => {
    await mount(fakeApi({ 'app:state': appState({ version: '1.2.3' }) }));
    expect($(TID.settings.version)!.textContent).toBe('版本 1.2.3');
  });

  it('T-02 有新版本：弹出更新框', async () => {
    await mount(fakeApi({ 'update:check': { kind: 'new', version: '1.1.0', notes: '支持 Kimi\n安装更快' } }));
    click($(TID.settings.checkUpdate));
    expect($(TID.settings.checkUpdate)!.textContent).toBe('正在检查…');
    await settle();
    expect($(TID.update.root)!.textContent).toContain('有新版本 1.1.0');
    expect($(TID.settings.checkUpdate)!.textContent).toBe('检查更新');
  });

  it('T-02 已是最新', async () => {
    await mount(fakeApi({ 'update:check': { kind: 'latest' } }));
    click($(TID.settings.checkUpdate));
    await settle();
    expect($(TID.toast)!.textContent).toContain('已经是最新版');
    expect($(TID.update.root)).toBeNull();
  });

  it('T-02 断网', async () => {
    await mount(fakeApi({ 'update:check': { kind: 'offline' } }));
    click($(TID.settings.checkUpdate));
    await settle();
    expect($(TID.toast)!.textContent).toContain('连不上网，稍后再试');
    expect($(TID.toast)!.classList.contains('error')).toBe(true);
  });
});

describe('一键还原（T-03）', () => {
  const plan = { lines: ['去掉「ChatGPT 汉化版」', '模型设置恢复原样'] };

  it('T-03 确认框列出会做的事，「先不了」什么都不做', async () => {
    const fake = fakeApi({ 'restore:plan': plan });
    const { go } = await mount(fake);
    click($(TID.settings.restore));
    await settle();
    const box = $(TID.dialog.root)!;
    expect(box.textContent).toContain('去掉「ChatGPT 汉化版」');
    expect(box.textContent).toContain('模型设置恢复原样');
    expect(box.textContent).toContain('聊天记录会留着');
    expect($(TID.dialog.cancel)!.textContent).toBe('先不了');
    click($(TID.dialog.cancel));
    await settle();
    expect(fake.called('restore:run')).toHaveLength(0);
    expect(go).not.toHaveBeenCalled();
    expect($(TID.dialog.root)).toBeNull();
  });

  it('T-03 确认还原 → 回到引导', async () => {
    const fake = fakeApi({ 'restore:plan': plan, 'restore:run': { ok: true } });
    const { go } = await mount(fake);
    click($(TID.settings.restore));
    await settle();
    click($(TID.dialog.confirm));
    await settle();
    expect(fake.called('restore:run')).toHaveLength(1);
    expect(go).toHaveBeenCalledWith('models');
  });

  it('T-03 还原失败：提示原因，不跳页', async () => {
    const fake = fakeApi({ 'restore:plan': plan, 'restore:run': { ok: false, reason: '有个文件正被占用' } });
    const { go } = await mount(fake);
    click($(TID.settings.restore));
    await settle();
    click($(TID.dialog.confirm));
    await settle();
    expect(go).not.toHaveBeenCalled();
    expect($(TID.toast)!.textContent).toContain('有个文件正被占用');
  });

  it('T-03 还原失败没给原因时也有提示', async () => {
    await mount(fakeApi({ 'restore:plan': plan, 'restore:run': { ok: false } }));
    click($(TID.settings.restore));
    await settle();
    click($(TID.dialog.confirm));
    await settle();
    expect($(TID.toast)!.textContent).toContain('没还原成功');
  });
});

describe('一键还原出错时（T-03）', () => {
  it('T-03 没拿到清单也照样弹确认框', async () => {
    await mount(fakeApi({ 'restore:plan': { ok: false } }));
    click($(TID.settings.restore));
    await settle();
    expect($(TID.dialog.root)!.textContent).toContain('聊天记录会留着');
  });

  it('T-03 清单里已经写了聊天记录留着，就不再多写一行', async () => {
    await mount(fakeApi({ 'restore:plan': { lines: ['卸掉 CodexBuddy 装的 Codex', '聊天记录和分身的聊天记录都留着'] } }));
    click($(TID.settings.restore));
    await settle();
    const ps = [...$(TID.dialog.root)!.querySelectorAll('p')].map(p => p.textContent);
    expect(ps).toEqual(['卸掉 CodexBuddy 装的 Codex', '聊天记录和分身的聊天记录都留着']);
  });
});

describe('画中画开着时（ui-design/app 设置页第 5 版）', () => {
  it('设置页内容变窄，给右下角的画中画让位，按钮不被挡', () => {
    const css = readFileSync('ui/app.css', 'utf8');
    expect(css).toContain('.pip-open .settings { max-width: calc(100% - 330px); }');
  });
});
