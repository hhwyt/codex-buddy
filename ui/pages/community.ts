// 社群 page (ui-design/nav-community.html v1, 小红书 next to it per ui-design/xhs-entry.html v1; codes per design/wechat-qr.html v4). Owner: A6.
// H-02 社群码：在线显示最新的，断网显示上次的，一次都没取到显示 App 自带的个人微信码（扫码加好友，再拉进交流群）。
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { Page } from './types.js';
import type { BuddyApi } from '../api.js';

const QR_KEY = 'codexbuddy.community.qr';
/** The personal WeChat code of 「黄金金不AI」 shipped with the app: it never expires, so it shows even before the remote
 *  config is reachable; a code from the remote config replaces it */
export const BUNDLED_QR = 'assets/wechat-qr.png';
/** The 小红书 account 「黄金金不AI」: a code for its profile page (xiaohongshu.com/user/profile/…) */
export const XHS_QR = 'assets/xhs-qr.png';

/** The last community code we saw: the page keeps a copy so an offline start still shows it (H-02) */
export function communityQr(fresh: string | null): string | null {
  try {
    if (fresh) { localStorage.setItem(QR_KEY, fresh); return fresh; }
    return localStorage.getItem(QR_KEY);
  } catch { return fresh; }
}

/** The two QR cards with their captions: the only source of the 社群 content, shared by the page and the lock overlay. */
function communityCols(qr: string): HTMLElement[] {
  return [
    h('div', { class: 'community-col' },
      h('p', { class: 'community-line community-top', 'aria-hidden': 'true' }, ' '),
      h('img', { class: 'community-qr', src: qr, alt: '微信二维码', 'data-testid': TID.community.qr }),
      h('div', {},
        h('p', { class: 'community-line' }, h('span', {}, '有问题？加我', h('span', { class: 'brand-wechat' }, '微信'))),
        h('p', { class: 'community-sub' }, '扫码加好友，拉你进交流群'))),
    h('div', { class: 'community-col' },
      h('p', { class: 'community-line' }, '关注我，和我一起用 AI 改变世界'),
      h('img', { class: 'community-qr', src: XHS_QR, alt: '小红书二维码', 'data-testid': TID.community.xhsQr }),
      h('div', {},
        h('p', { class: 'community-line' }, h('span', { class: 'xhs-chip' }, '小红书'), '黄金金不AI'),
        h('p', { class: 'community-sub' }, 'AI 产品 · 机器工作，人类生活'))),
  ];
}

export const renderCommunity: Page = async ({ api, root, copied }) => {
  const state = await api.invoke('app:state');
  const qr = communityQr(state.community.qrUrl) ?? BUNDLED_QR;
  root.replaceChildren(h('div', { class: 'community', 'data-testid': TID.community.root },
    h('h1', {}, '社群'),
    ...(copied ? [h('p', { class: 'community-copied', 'data-testid': TID.community.copied }, '✓ 日志已复制（Key 已打码），加微信后粘贴发给我们')] : []),
    h('div', { class: 'community-body' }, ...communityCols(qr))));
};

export interface CommunityOverlay { el: HTMLElement; close(): void }

/** 锁定状态下的社群页：整页盖在 App 上，侧边栏被遮罩挡住，只能从「返回」回到原弹窗。
 *  offline 时完全不读后端，只显示上次缓存或自带的群码；否则先用缓存/自带群码立刻渲染，再异步刷新为远程最新码。 */
export function showCommunityOverlay(
  api: BuddyApi, root: HTMLElement, opts: { offline?: boolean }, onBack: () => void,
): CommunityOverlay {
  const body = h('div', { class: 'community-body' });
  const back = h('button', { class: 'back', type: 'button', 'data-testid': TID.community.back }, '← 返回');
  const gate = h('div', { class: 'community-gate', 'data-testid': TID.community.full },
    h('aside', { class: 'side', 'aria-hidden': 'true' },
      h('div', { class: 'brand' }, h('img', { src: 'assets/icon.svg', width: 22, height: 22, alt: '' }), h('span', {}, 'CodexBuddy')),
      h('nav', {},
        h('span', { class: 'nav-item' }, '模型'),
        h('span', { class: 'nav-item' }, '设置'),
        h('span', { class: 'nav-item', 'aria-current': 'page' }, '社群'))),
    h('div', { class: 'side-mask', 'aria-hidden': 'true' }, '🔒'),
    h('main', { class: 'lock-main' },
      h('div', { class: 'lock-top' }, back),
      h('h1', {}, '社群'),
      body));
  const render = (qr: string) => body.replaceChildren(...communityCols(qr));
  render(communityQr(null) ?? BUNDLED_QR);
  if (!opts.offline) {
    void api.invoke('app:state').then(state => render(communityQr(state.community.qrUrl) ?? BUNDLED_QR)).catch(() => {});
  }
  let closed = false;
  const onKey = (event: KeyboardEvent) => {
    if (!gate.isConnected) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (event.key === 'Tab') {
      event.preventDefault(); event.stopImmediatePropagation();
      const buttons = [...gate.querySelectorAll<HTMLButtonElement>('button')];
      if (buttons.length) buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + 1) % buttons.length].focus();
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    gate.remove();
  };
  back.onclick = () => { close(); onBack(); };
  document.addEventListener('keydown', onKey, true);
  root.append(gate);
  back.focus();
  return { el: gate, close };
}
