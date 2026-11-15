// 社群 page (ui-design/nav-community.html v1, 小红书 next to it per ui-design/xhs-entry.html v1). Owner: A6. H-02 社群码：在线显示最新的，断网显示上次的，
// 一次都没取到显示 App 自带的企业微信群码。No group name: a full group is swapped for a new one behind the same code.
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { Page } from './types.js';

const QR_KEY = 'codexbuddy.community.qr';
/** The WeCom group join code shipped with the app: it never expires, so it shows even before the remote config is
 *  reachable; a code from the remote config replaces it */
export const BUNDLED_QR = 'assets/community-qr.png';
/** The 小红书 account 「黄金金不AI」: a code for its profile page (xiaohongshu.com/user/profile/…) */
export const XHS_QR = 'assets/xhs-qr.png';

/** The last community code we saw: the page keeps a copy so an offline start still shows it (H-02) */
export function communityQr(fresh: string | null): string | null {
  try {
    if (fresh) { localStorage.setItem(QR_KEY, fresh); return fresh; }
    return localStorage.getItem(QR_KEY);
  } catch { return fresh; }
}

export const renderCommunity: Page = async ({ api, root }) => {
  const state = await api.invoke('app:state');
  const qr = communityQr(state.community.qrUrl) ?? BUNDLED_QR;
  root.replaceChildren(h('div', { class: 'community', 'data-testid': TID.community.root },
    h('h1', {}, '社群'),
    h('div', { class: 'community-body' },
      h('div', { class: 'community-col' },
        h('img', { class: 'community-qr', src: qr, alt: '企业微信群二维码', 'data-testid': TID.community.qr }),
        h('div', {},
          h('p', { class: 'community-line' }, '使用有问题？加群咨询'),
          h('p', { class: 'community-sub' }, '企业微信群，扫码就进'))),
      h('div', { class: 'community-col' },
        h('img', { class: 'community-qr', src: XHS_QR, alt: '小红书二维码', 'data-testid': TID.community.xhsQr }),
        h('div', {},
          h('p', { class: 'community-line' }, h('span', { class: 'xhs-chip' }, '小红书'), '关注小红书'),
          h('p', { class: 'community-sub' }, '「黄金金不AI」，看更多 Codex 用法'))))));
};
