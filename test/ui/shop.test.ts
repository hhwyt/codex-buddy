// @vitest-environment happy-dom
// L3: 商城 page (P-01..P-03, design/shop-entries.html 第 2 版).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderShop } from '../../ui/pages/shop';
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

describe('商城页（P-01..P-04）', () => {
  it('P-01 标题「商城」，三个入口并排，不写套餐和价格', async () => {
    await mount(fakeApi());
    const root = $(TID.shop.root)!;
    expect(root.querySelector('h1')!.textContent).toBe('商城');
    expect(root.querySelectorAll('button')).toHaveLength(3);
    expect(root.textContent).toBe('商城微信 / 支付宝付款，付完自动发货注册要手机验证码注册、登录 OpenAI 官方账号时收短信用ChatGPT 会员更强的官方 GPT 模型静态住宅 IP防 Codex 风控降智防 Claude 封号黄金金同款独享、固定不变');
    expect(root.textContent).not.toMatch(/¥|元/);
  });

  it.each([
    ['P-02 验证码', TID.shop.sms, 'sms'],
    ['P-03 ChatGPT 会员', TID.shop.subscriptions, 'subscriptions'],
    ['P-04 静态住宅 IP', TID.shop.ip, 'ip'],
  ])('%s：点了在右侧浏览器打开对应的商城页', async (_name, testid, item) => {
    const fake = fakeApi();
    await mount(fake);
    $(testid)!.click();
    expect(fake.calls.filter(c => c.channel === 'shop:open').map(c => c.args)).toEqual([{ item }]);
  });
});
