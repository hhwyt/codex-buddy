// settings page. Owner: A6. T-01..T-03, L-01..L-07: 汉化两张预览图（照 ui-design/language-final.html）、版本和检查更新、一键还原
import { dialog } from '../components/dialog.js';
import { toast } from '../components/toast.js';
import { helpLink } from '../components/help.js';
import { promptRestart } from '../components/restart.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { BuddyApi } from '../api.js';
import type { Page } from './types.js';
import { showUpdate } from './update.js';

/** Animation timing (ms). Tests set these to 0. */
export const motion = { lineMs: 170, gapMs: 60, settleMs: 300, flyMs: 950 };
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

type Lang = 'en' | 'zh';
/** Preview lines: [English, 中文]; first 4 in the sidebar, then the title and the input box */
const SIDEBAR: [string, string][] = [['New chat', '新对话'], ['Skills', '技能'], ['Automations', '自动化'], ['Settings', '设置']];
const TITLE: [string, string] = ["Let's build", '我们来构建点什么'];
const INPUT: [string, string] = ['Ask Codex anything…', '向 Codex 提问…'];
const CODEX_ICON = 'assets/logos/openai.webp';

const word = (pair: [string, string], lang: Lang, tag: 'span' | 'b' = 'span') =>
  h(tag, { class: 'w', 'data-e': pair[0], 'data-z': pair[1] }, lang === 'zh' ? pair[1] : pair[0]);

function preview(lang: Lang): HTMLElement {
  return h('div', { class: 'shot' },
    h('div', { class: 'bar' }),
    h('div', { class: 'body' },
      h('div', { class: 'sb' }, ...SIDEBAR.map(p => word(p, lang))),
      h('div', { class: 'ct' }, word(TITLE, lang, 'b'), h('div', { class: 'in' }, word(INPUT, lang)))));
}

const setWords = (shot: HTMLElement, lang: Lang) => {
  for (const w of shot.querySelectorAll<HTMLElement>('.w')) w.textContent = lang === 'zh' ? w.dataset.z! : w.dataset.e!;
};

/** Lines flip one by one: top → bottom into Chinese, bottom → top back to English (L-02, L-03) */
async function morph(shot: HTMLElement, to: Lang): Promise<void> {
  const words = [...shot.querySelectorAll<HTMLElement>('.w')];
  if (to === 'en') words.reverse();
  const scan = h('span', { class: `scan ${to === 'zh' ? 'down' : 'up'}` });
  shot.append(scan);
  for (const w of words) {
    w.classList.add('flip');
    await wait(motion.lineMs);
    w.textContent = to === 'zh' ? w.dataset.z! : w.dataset.e!;
    w.classList.remove('flip');
    await wait(motion.gapMs);
  }
  await wait(motion.settleMs);
  scan.remove();
}

const TRASH_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="lid" d="M4 6h16M9 6V4h6v2"/><path d="M6 6l1 14h10l1-14M10 10v7M14 10v7"/></svg>';

export const renderSettings: Page = async ({ api, root, go }) => {
  const state = await api.invoke('app:state');
  let lang: Lang = state.zh.on ? 'zh' : 'en';
  let launcher = state.zh.launcherExists;
  let busy = false;
  const msg = h('div', { class: 'lang-msg', role: 'status', 'data-testid': TID.settings.langMsg });

  const radio = (on: boolean) => h('span', { class: on ? 'radio on' : 'radio' });
  const enShot = preview('en');
  const zhShot = preview('zh');
  const enRadio = radio(false);
  const zhRadio = radio(false);
  const trash = h('button', {
    class: 'trash', type: 'button', title: '去掉汉化版', 'aria-label': '去掉汉化版', 'data-testid': TID.settings.zhTrash,
    onclick: (e: Event) => { e.stopPropagation(); void removeZh(); },
  });
  trash.innerHTML = TRASH_SVG;
  trash.append(h('span', { class: 'tip' }, '去掉汉化版'));

  const enCard = h('button', { class: 'pick', type: 'button', role: 'radio', 'data-testid': TID.settings.enCard, onclick: () => void choose('en') },
    h('span', { class: 'cap' }, enRadio, '英文原版'), enShot);
  const zhCard = h('div', { class: 'pick', role: 'radio', tabindex: '0', 'data-testid': TID.settings.zhCard, onclick: () => void choose('zh'),
    onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void choose('zh'); } } },
  h('span', { class: 'cap' }, zhRadio, '汉化版'), zhShot);

  const mark = (l: Lang, spinning = false) => {
    enCard.classList.toggle('on', l === 'en');
    zhCard.classList.toggle('on', l === 'zh');
    enCard.setAttribute('aria-checked', String(l === 'en'));
    zhCard.setAttribute('aria-checked', String(l === 'zh'));
    enRadio.className = l === 'en' ? (spinning ? 'spin' : 'radio on') : 'radio';
    zhRadio.className = l === 'zh' ? (spinning ? 'spin' : 'radio on') : 'radio';
  };
  // The trash exists only while the 汉化版 launcher does (L-04)
  const showTrash = () => { zhCard.classList.toggle('has', launcher); if (launcher) zhShot.append(trash); else trash.remove(); };
  /** While a switch or removal runs the previews ignore clicks; aria-busy says so */
  const setBusy = (on: boolean) => { busy = on; for (const c of [enCard, zhCard]) c.setAttribute('aria-busy', String(on)); };
  mark(lang);
  showTrash();

  const say = (...children: (Node | string)[]) => msg.replaceChildren(...children);
  const ok = () => h('span', { class: 'ok' }, '✓');
  const bad = () => h('span', { class: 'err' }, '✗');
  const btn = (label: string, onclick: () => void, primary = false) =>
    h('button', { class: primary ? 'btn small primary' : 'btn small', type: 'button', onclick }, label);
  const openCodex = () => { void api.invoke('codex:open', {}); say(); };

  async function choose(to: Lang): Promise<void> {
    if (busy || to === lang) return;
    setBusy(true);
    const shot = to === 'zh' ? zhShot : enShot;
    setWords(shot, to === 'zh' ? 'en' : 'zh'); // start from the other language, then morph into the target
    mark(to, true);
    say(h('span', { class: 'muted' }, to === 'zh' ? '正在换成中文…' : '正在切回英文…'));
    const [res] = await Promise.all([api.invoke('zh:set', { on: to === 'zh' }), morph(shot, to)]);
    if (!res.ok) {
      setWords(shot, to);
      if (to === 'zh') { // L-06: back to English, Codex still works
        lang = 'en';
        mark('en');
        say(bad(), ' 这个版本的 Codex 暂时汉化不了，已经退回英文原版，Codex 照常能用 ', btn('知道了', () => say()));
      } else {
        mark(lang);
        say(bad(), ` ${res.reason ?? '没切回英文原版'} `, btn('重试', () => void choose('en')), helpLink());
      }
      setBusy(false);
      return;
    }
    lang = to;
    mark(to);
    if (to === 'zh') launcher = true;
    showTrash();
    if (res.restartRequired || res.openRequired) {
      say();
    } else if (to === 'zh') {
      say(ok(), ' 好了：从「ChatGPT 汉化版」打开就是中文 ', btn('打开看看', openCodex, true));
    } else {
      say(ok(), ' 已切回英文原版；分身也变回英文。「ChatGPT 汉化版」图标还留着，想去掉点它右下角的垃圾桶');
    }
    setBusy(false);
    if (res.restartRequired || res.openRequired) await promptRestart(api, !res.restartRequired);
  }

  async function removeZh(): Promise<void> { // L-04: removes the launcher only
    if (busy) return;
    if (lang === 'zh') {
      await choose('en');
      if (lang === 'zh') return;
    }
    setBusy(true);
    trash.classList.add('open');
    const flyer = h('span', { class: 'flyer' }, h('img', { src: CODEX_ICON, alt: '' }), h('i', {}, '中'));
    zhCard.append(flyer);
    requestAnimationFrame(() => flyer.classList.add('go'));
    const [res] = await Promise.all([api.invoke('zh:remove'), wait(motion.flyMs)]);
    flyer.remove();
    trash.classList.remove('open');
    if (res.ok) {
      launcher = false;
      showTrash();
      say(ok(), ' 已去掉「ChatGPT 汉化版」图标。Codex 和聊天记录都没动；以后想用中文，再点「汉化版」就会重新加上');
    } else {
      say(bad(), ' 「ChatGPT 汉化版」图标没去掉，从原来的 ChatGPT 打开已经是英文了 ', btn('重试', () => void removeZh()), helpLink());
    }
    setBusy(false);
  }

  const langPanel = state.zh.hidden ? null : h('div', { class: 'panel lang' },
    h('div', { class: 'ft' }, 'Codex 界面'),
    h('div', { class: 'picks' }, enCard, zhCard),
    msg);

  const checkBtn = h('button', { class: 'btn', type: 'button', 'data-testid': TID.settings.checkUpdate, onclick: () => void check() }, '检查更新');
  async function check(): Promise<void> { // T-02
    checkBtn.disabled = true;
    checkBtn.textContent = '正在检查…';
    const res = await api.invoke('update:check');
    checkBtn.disabled = false;
    checkBtn.textContent = '检查更新';
    if (res.kind === 'new') showUpdate(api, document.body, { version: res.version, notes: res.notes });
    else if (res.kind === 'latest') toast('已经是最新版');
    else toast('连不上网，稍后再试', { error: true });
  }

  async function restore(): Promise<void> { // T-03, T-04
    const plan = await api.invoke('restore:plan');
    // The plan's own last line already says chat history stays; add ours only when it does not (no line said twice)
    const planned = plan.lines ?? [];
    const lines = planned.some(l => l.includes('聊天记录')) ? planned : [...planned, '聊天记录会留着'];
    const yes = await dialog({ title: '一键还原', lines, confirm: '一键还原', cancel: '先不了', danger: true });
    if (!yes) return;
    const res = await api.invoke('restore:run');
    if (res.ok) go('models');
    else toast(res.reason ?? '没还原成功', { error: true });
  }

  root.replaceChildren(h('div', { class: 'settings', 'data-testid': TID.settings.root },
    h('h1', {}, '设置'),
    langPanel,
    h('div', { class: 'panel row-between' },
      h('span', { 'data-testid': TID.settings.version }, `版本 ${state.version}`), checkBtn),
    h('div', { class: 'panel row-between' },
      h('span', {}, h('b', {}, '一键还原'), h('span', { class: 'muted block' }, '回到装 CodexBuddy 之前的样子，聊天记录留着')),
      h('button', { class: 'btn', type: 'button', 'data-testid': TID.settings.restore, onclick: () => void restore() }, '一键还原'))));
};
