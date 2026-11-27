// 换新 Key dialog (Y-01..Y-06, design/key-rotate.html 第 3 版): three circles 新建 Key → 测试连通 → 作废旧 Key, driven by
// the main process `step` events of flow 'key'. Nothing changes until the new key passes the test (Y-03).
import type { CardView, Outcome, StepView } from '../../electron/main/ipc-contract.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { BuddyApi } from '../api.js';
import { logoSrc } from './card.js';
import { helpLink } from './help.js';

const WARN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>';
const CIRCLE: Record<string, number> = { new: 0, test: 1, revoke: 2 };
/** How long the three ticks stay before the restart confirmation */
export const RESTART_AFTER_MS = 900;

export interface RotateResult { changed: boolean; outcome?: Outcome }

/** Where dialogs go: the app root carries browser-expanded / --browser-width, so the dialog keeps clear of the browser */
const hostRoot = (): HTMLElement => document.querySelector<HTMLElement>('.browser-host')?.parentElement ?? document.body;

export function rotateKeyDialog(api: BuddyApi, c: CardView): Promise<RotateResult> {
  const custom = logoSrc(c.vendor) === null;
  const labels = custom ? ['粘贴新 Key', '测试连通', '保存'] : ['新建 Key', '测试连通', '作废旧 Key'];
  return new Promise(resolve => {
    let running = false;
    let changed = false;
    let outcome: Outcome | undefined;
    const close = () => { off(); scrim.remove(); document.removeEventListener('keydown', onKey); resolve({ changed, outcome }); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !running) close(); };

    const src = logoSrc(c.vendor);
    const logo = h('span', { class: 'kr-logo' }, src ? h('img', { src, alt: '' }) : h('b', {}, c.name.slice(0, 1)));
    const newTail = h('span', { class: 'kr-new', 'data-testid': TID.keyRotate.newTail }, 'sk-••••····');
    const paste = custom ? h('input', { class: 'kr-paste', placeholder: '粘贴新 Key', 'data-testid': TID.keyRotate.paste, oninput: () => { start.disabled = !paste!.value.trim(); } }) : null;
    const fill = h('i');
    const circles = labels.map((text, i) => h('div', { class: 'kr-c', 'data-testid': TID.keyRotate.circle(i), 'data-state': 'idle' }, h('span', { class: 'o' }), text));
    const msg = h('p', { class: 'kr-msg', 'data-testid': TID.keyRotate.msg });
    const log = h('div', { class: 'kr-log', 'data-testid': TID.keyRotate.log, hidden: true });
    const more = h('button', { class: 'kr-more', type: 'button', 'data-testid': TID.keyRotate.more, onclick: () => {
      log.hidden = !log.hidden;
      more.textContent = log.hidden ? '看明细 ▾' : '收起 ▴';
    } }, '看明细 ▾');
    const row = h('div', { class: 'kr-row' });
    const start = h('button', { class: 'btn primary', type: 'button', 'data-testid': TID.keyRotate.start, disabled: custom, onclick: () => void run() }, '开始换');

    const button = (text: string, testid: string, onclick: () => void, primary = false) =>
      h('button', { class: primary ? 'btn primary' : 'btn', type: 'button', 'data-testid': testid, onclick }, text);
    const firstRow = () => {
      const warn = custom ? null : h('span', { class: 'kr-warn' });
      if (warn) { warn.innerHTML = WARN_SVG; warn.append('旧 Key 会作废'); }
      row.replaceChildren(...[warn, button('先不了', TID.keyRotate.cancel, close), start].filter((n): n is HTMLElement => n !== null));
    };
    const set = (i: number, state: 'idle' | 'now' | 'wait' | 'done' | 'fail') => {
      circles[i].dataset.state = state;
      circles[i].querySelector('.o')!.textContent = state === 'done' ? '✓' : state === 'fail' ? '✕' : '';
      fill.style.width = `${circles.filter(x => x.dataset.state === 'done').length >= 2 ? 100 : circles[0].dataset.state === 'done' ? 50 : 0}%`;
    };
    const say = (text: string, error = false) => { msg.textContent = text; msg.classList.toggle('err', error); };

    const off = api.on('step', (s: StepView) => {
      if (s.flow !== 'key') return;
      const i = CIRCLE[s.id];
      if (s.text) log.append(h('div', {}, i === undefined ? s.text : `${labels[i]}：${s.text}`));
      if (i === undefined) return;
      if (s.state === 'start') { set(i, s.text ? 'wait' : 'now'); say(s.text); return; }
      set(i, s.state);
      if (s.state === 'done' && s.id === 'new' && s.text) {
        newTail.textContent = s.text;
        newTail.classList.remove('roll');
        void newTail.offsetWidth; // restart the roll-in
        newTail.classList.add('roll');
      }
      if (s.state === 'fail' && s.text) say(s.text, true);
    });

    async function run(): Promise<void> {
      running = true;
      circles.forEach((_, i) => set(i, 'idle'));
      say('');
      row.replaceChildren();
      if (paste) paste.disabled = true;
      let r: Outcome;
      try { r = await api.invoke('key:replace', paste ? { vendor: c.vendor, key: paste.value.trim() } : { vendor: c.vendor }); }
      catch { r = { ok: false }; }
      running = false;
      if (r.ok) {
        changed = true;
        outcome = r;
        if (r.revokePending) return pending();
        return finished();
      }
      if (paste) paste.disabled = false;
      const failed = circles.findIndex(x => x.dataset.state === 'fail');
      if (failed < 0) set(Math.max(0, circles.findIndex(x => x.dataset.state !== 'done')), 'fail');
      say(r.kind === 'cancelled' ? '取消了，还在用原来的 Key' : `${r.reason ?? '没换成'}，还在用原来的 Key`, r.kind !== 'cancelled');
      const actions: HTMLElement[] = [button('关掉', TID.keyRotate.close, close), button('再试一次', TID.keyRotate.retry, () => void run(), true)];
      if (r.kind !== 'cancelled') actions.unshift(helpLink());
      row.replaceChildren(...actions);
    }
    /** Like a switch: when ChatGPT has to (re)start to use the new key, the ticks stay a moment and then the same
     *  restart confirmation as 切换 takes over (the page shows it after this resolves); otherwise 好 */
    function finished(): void {
      circles.forEach((_, i) => set(i, 'done'));
      say('');
      if (outcome?.restartRequired || outcome?.openRequired) { setTimeout(close, RESTART_AFTER_MS); return; }
      row.replaceChildren(button('好', TID.keyRotate.ok, close, true));
    }
    /** Y-05: the new key works, the old one is still accepted: 去官网删 retries the official page */
    function pending(): void {
      set(2, 'fail');
      say('旧 Key 还能用', true);
      row.replaceChildren(button('关掉', TID.keyRotate.close, close), button('去官网删', TID.keyRotate.revoke, async () => {
        running = true;
        row.replaceChildren();
        say('');
        let r: Outcome;
        try { r = await api.invoke('key:revoke', { vendor: c.vendor }); } catch { r = { ok: false }; }
        running = false;
        if (r.ok) finished(); else pending();
      }, true));
    }

    const box = h('div', { class: 'dialog kr', role: 'dialog', 'aria-modal': 'true', 'aria-label': '换新 Key', 'data-testid': TID.keyRotate.root },
      h('h2', {}, logo, '换新 Key'),
      h('div', { class: 'kr-swap' }, h('s', {}, c.keyTail ? `sk-••••${c.keyTail}` : 'sk-••••'), h('span', {}, '→'), newTail),
      paste,
      h('div', { class: 'kr-circles' }, h('div', { class: 'kr-line' }, fill), ...circles),
      msg, more, log, row);
    const scrim = h('div', { class: 'scrim kr-scrim', onclick: (e: Event) => { if (e.target === scrim && !running) close(); } }, box);
    firstRow();
    document.addEventListener('keydown', onKey);
    hostRoot().append(scrim);
    paste?.focus();
  });
}
