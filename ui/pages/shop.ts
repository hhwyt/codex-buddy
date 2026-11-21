// 商城 page (design/shop-entries.html 第 2 版). P-01..P-03: three entries side by side with a name and what it is for,
// no plans and no prices: those change on the shop and the app is not released often. Each opens the shop in the
// right-side browser, expanded; the main process holds the URLs.
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { Page } from './types.js';

const PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10 18.5h4"/></svg>';
const SHIELD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>';
const EXTERNAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>';

const svg = (cls: string, markup: string): HTMLElement => { const el = h('span', { class: cls }); el.innerHTML = markup; return el; };

const ENTRIES = [
  { item: 'sms', testid: TID.shop.sms, hl: 'sms', icon: () => svg('shop-card-icon', PHONE), name: '注册要手机验证码', tags: [], sub: '注册、登录 OpenAI 官方账号时收短信用' },
  { item: 'subscriptions', testid: TID.shop.subscriptions, hl: 'gpt', icon: () => h('span', { class: 'shop-card-icon' }, h('img', { src: 'assets/logos/openai.webp', alt: '' })), name: 'ChatGPT 会员', tags: [], sub: '更强的官方 GPT 模型' },
  { item: 'ip', testid: TID.shop.ip, hl: '', icon: () => svg('shop-card-icon dark', SHIELD), name: '静态住宅 IP', tags: ['防 Codex 风控降智', '防 Claude 封号', '黄金金同款'], sub: '独享、固定不变' },
] as const;

export const renderShop: Page = ({ api, root, highlight }) => {
  root.replaceChildren(h('div', { 'data-testid': TID.shop.root },
    h('h1', {}, '商城'),
    h('p', { class: 'shop-lead' }, '微信 / 支付宝付款，付完自动发货'),
    h('div', { class: 'shop-grid' }, ...ENTRIES.map(e =>
      h('button', { class: e.hl && highlight === e.hl ? 'shop-card hl' : 'shop-card', type: 'button', 'data-testid': e.testid, onclick: () => { void api.invoke('shop:open', { item: e.item }); } },
        e.icon(),
        svg('shop-card-arrow', EXTERNAL),
        h('b', {}, e.name),
        ...(e.tags.length ? [h('span', { class: 'shop-card-tags' }, ...e.tags.map(t => h('span', { class: 'shop-card-tag' }, t)))] : []),
        h('span', { class: 'shop-card-sub' }, e.sub))))));
};
