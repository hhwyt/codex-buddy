// help page. Owner: A6. H-01 报错解读；H-02 社群码：在线显示最新的，断网显示上次的，一次都没取到显示 App 自带的企业微信群码
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { Page } from './types.js';

const QR_KEY = 'codexbuddy.community.qr';
/** The WeCom group join code shipped with the app: it never expires, so it shows even before the remote config is
 *  reachable; a code from the remote config replaces it */
export const BUNDLED_QR = 'assets/community-qr.png';
const BUNDLED_WORDS = '微信扫码进群';

/** The last community code we saw: the page keeps a copy so an offline start still shows it (H-02) */
export function communityQr(fresh: string | null): string | null {
  try {
    if (fresh) { localStorage.setItem(QR_KEY, fresh); return fresh; }
    return localStorage.getItem(QR_KEY);
  } catch { return fresh; }
}

export const renderHelp: Page = async ({ api, root }) => {
  const state = await api.invoke('app:state');
  const input = h('textarea', { class: 'help-input', rows: '5', placeholder: '把 Codex 里的报错粘到这里', 'data-testid': TID.help.errorInput });
  const explain = h('button', { class: 'btn primary', type: 'button', disabled: true, 'data-testid': TID.help.explain, onclick: () => void run() }, '看看是什么意思');
  const result = h('div', { class: 'help-result', 'data-testid': TID.help.explanation, hidden: true });
  input.addEventListener('input', () => { explain.disabled = input.value.trim() === ''; });

  async function run(): Promise<void> { // H-01
    explain.disabled = true;
    const res = await api.invoke('help:explain', { text: input.value });
    explain.disabled = false;
    const failed = res as { title?: string; reason?: string };
    result.replaceChildren(
      h('b', {}, failed.title ?? '暂时看不懂这条报错'),
      h('div', { class: 'muted' }, res.body ?? failed.reason ?? '扫下面的码进群，把报错发给我们'),
      h('div', { class: 'row-end' }, h('button', { class: 'btn', type: 'button', 'data-testid': TID.help.gotIt, onclick: () => {
        result.hidden = true;
        result.replaceChildren();
        input.value = '';
        explain.disabled = true;
      } }, '知道了')));
    result.hidden = false;
  }

  // The code and its words come from the remote config; never fetched online yet → the bundled code (H-02)
  const qr = communityQr(state.community.qrUrl) ?? BUNDLED_QR;
  const words = state.community.text || BUNDLED_WORDS;
  const code = h('div', { class: 'qr', 'data-testid': TID.help.community },
    qr ? h('img', { src: qr, alt: '社群二维码' }) : null, h('span', { class: 'muted' }, words));

  root.replaceChildren(h('div', { class: 'help', 'data-testid': TID.help.root },
    h('h1', {}, '帮助'),
    h('div', { class: 'panel' }, h('div', { class: 'ft' }, '粘贴报错'), input, h('div', { class: 'row-end' }, explain), result),
    h('div', { class: 'panel row-between' },
      h('div', {}, h('div', { class: 'ft' }, '扫码问我们'), h('div', { class: 'muted' }, '解决不了就扫码进群，把报错发给我们')),
      code)));
};
