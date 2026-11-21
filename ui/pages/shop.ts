// 商城 page (design/shop-entry.html 5B). P-01..P-03: the SMS code is the one thing sold here; the subscriptions sit
// behind one quiet line with no brand or price. Both open the shop in the right-side browser, expanded.
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { Page } from './types.js';

/** The SMS code's price on the shop's product page (SHOP_URLS.sms in electron/main/browser.ts, 2026-11-20) */
export const SMS_PRICE_YUAN = 35;

const PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10 18.5h4"/></svg>';

export const renderShop: Page = ({ api, root }) => {
  const icon = h('span', { class: 'shop-card-icon' });
  icon.innerHTML = PHONE;
  root.replaceChildren(h('div', { 'data-testid': TID.shop.root },
    h('h1', {}, '商城'),
    h('p', { class: 'shop-lead' }, '微信 / 支付宝付款，付完自动发货'),
    h('button', { class: 'shop-card', type: 'button', 'data-testid': TID.shop.sms, onclick: () => { void api.invoke('shop:open', { item: 'sms' }); } },
      icon,
      h('span', { class: 'shop-card-text' },
        h('b', {}, '注册要手机验证码'),
        h('span', {}, '注册、登录 OpenAI 官方账号时收短信用，收不到可换号')),
      h('span', { class: 'shop-card-price' }, `¥${SMS_PRICE_YUAN}`)),
    h('div', {},
      h('button', { class: 'shop-more', type: 'button', 'data-testid': TID.shop.subscriptions, onclick: () => { void api.invoke('shop:open', { item: 'subscriptions' }); } },
        '官方模型订阅 ›'))));
};
