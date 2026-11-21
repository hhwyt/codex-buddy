// @vitest-environment happy-dom
// L3: 商城 page (P-01..P-03, design/shop-entry.html 5B).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderShop, SMS_PRICE_YUAN } from '../../ui/pages/shop';
import { TID } from '../../ui/testids';
import { fakeApi } from './settings.fake';

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function mount(fake: ReturnType<typeof fakeApi>) {
  document.body.innerHTML = '<div id="root"></div>';
  await renderShop({ api: fake.api, root: document.getElementById('root')!, go: vi.fn() });
}

afterEach(() => { document.body.innerHTML = ''; });

describe('F-08 从官方卡跳来', () => {
  it('高亮对应的那一项', async () => {
    const fake = fakeApi();
    document.body.innerHTML = '<div id="root"></div>';
    await renderShop({ api: fake.api, root: document.getElementById('root')!, go: vi.fn(), highlight: 'sms' });
    expect($(TID.shop.sms)!.classList.contains('hl')).toBe(true);
    expect($(TID.shop.subscriptions)!.classList.contains('hl')).toBe(false);
    await renderShop({ api: fake.api, root: document.getElementById('root')!, go: vi.fn(), highlight: 'gpt' });
    expect($(TID.shop.subscriptions)!.classList.contains('hl')).toBe(true);
  });
});

describe('商城页（P-01..P-03）', () => {
  it('P-01 标题「商城」，一张验证码大卡和一行「购买更强的官方 GPT 模型」，别的不放', async () => {
    await mount(fakeApi());
    const root = $(TID.shop.root)!;
    expect(root.querySelector('h1')!.textContent).toBe('商城');
    expect(root.querySelectorAll('button')).toHaveLength(2);
    expect(root.textContent).toBe('商城微信 / 支付宝付款，付完自动发货注册要手机验证码注册、登录 OpenAI 官方账号时收短信用，收不到可换号¥35购买更强的官方 GPT 模型');
    expect(SMS_PRICE_YUAN).toBe(35);
  });

  it('P-02 点验证码大卡：在右侧浏览器打开验证码商品', async () => {
    const fake = fakeApi();
    await mount(fake);
    $(TID.shop.sms)!.click();
    expect(fake.calls.filter(c => c.channel === 'shop:open').map(c => c.args)).toEqual([{ item: 'sms' }]);
  });

  it('P-03 「购买更强的官方 GPT 模型」不写品牌和价格，点了在右侧浏览器打开订阅分类', async () => {
    const fake = fakeApi();
    await mount(fake);
    const more = $(TID.shop.subscriptions)!;
    expect(more.textContent).toBe('购买更强的官方 GPT 模型');
    more.click();
    expect(fake.calls.filter(c => c.channel === 'shop:open').map(c => c.args)).toEqual([{ item: 'subscriptions' }]);
  });
});
