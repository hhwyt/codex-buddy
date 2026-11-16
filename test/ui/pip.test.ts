// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'vitest';
import { mountBrowser } from '../../ui/components/pip';
import { byTestId } from '../../ui/dom';
import { TID } from '../../ui/testids';
import { fakeApi } from './onboarding.fake';

let root: HTMLElement;
beforeEach(() => { document.body.replaceChildren(); document.head.replaceChildren(); root = document.createElement('div'); document.body.append(root); });
const get = (id: string) => byTestId(root, id);
const pip = { open: true, mode: 'pip' as const, url: 'https://open.bigmodel.cn/usercenter/apikeys', canGoBack: false, width: 0 };
const panel = { open: true, mode: 'expanded' as const, url: 'https://platform.deepseek.com/top_up', canGoBack: true, width: 500 };

function setup() {
  const f = fakeApi();
  const unmount = mountBrowser(f.api, root);
  return { ...f, unmount };
}

describe('right-side browser', () => {
  test('B-06 启动时是关着的', () => {
    setup();
    expect(get(TID.browser.pip)).toBeNull();
    expect(get(TID.browser.address)).toBeNull();
    expect(readFileSync('ui/index.html', 'utf8')).toContain('href="pip.css"');
  });

  test('B-01 后台自动操作时显示画中画（右下角），角上小点在闪，显示网站', () => {
    const f = setup();
    f.emit('browser', pip);
    const el = get(TID.browser.pip)!;
    expect(el.className).toBe('pip');
    expect(el.querySelector('.pip-live')).not.toBeNull();
    expect(el.textContent).toContain('open.bigmodel.cn');
  });

  test('B-01 地址不是网址时原样显示', () => {
    const f = setup();
    f.emit('browser', { ...pip, url: 'about:blank' });
    expect(get(TID.browser.pip)!.textContent).toContain('about:blank');
    f.emit('browser', { ...pip, url: 'not a url' });
    expect(get(TID.browser.pip)!.textContent).toContain('not a url');
  });

  test('B-03 点画中画 → 放大', () => {
    const f = setup();
    f.emit('browser', pip);
    get(TID.browser.pip)!.click();
    expect(f.invoke).toHaveBeenCalledWith('browser:show', { mode: 'expanded' });
  });

  test('B-03 点画中画上的放大按钮只放大一次', () => {
    const f = setup();
    f.emit('browser', pip);
    get(TID.browser.expand)!.click();
    expect(f.invoke).toHaveBeenCalledTimes(1);
    expect(f.invoke).toHaveBeenCalledWith('browser:show', { mode: 'expanded' });
  });

  test('B-02 展开时外框和原生网页一样宽，页面拿到宽度好让开；缩回画中画后不再让', () => {
    const f = setup();
    f.emit('browser', panel);
    const root = document.querySelector<HTMLElement>('.browser-host')!.parentElement!;
    expect(root.classList.contains('browser-expanded')).toBe(true);
    expect(root.style.getPropertyValue('--browser-width')).toBe('500px');
    f.emit('browser', pip);
    expect(root.classList.contains('browser-expanded')).toBe(false);
    expect(root.style.getPropertyValue('--browser-width')).toBe('0px');
  });

  test('M-08 等扫码时「缩小」不缩，只提示「扫完码再缩小」；扫完照常能缩', () => {
    const f = setup();
    f.emit('browser', panel);
    document.documentElement.classList.add('scan-waiting');
    try {
      get(TID.browser.shrink)!.click();
      expect(f.invoke).not.toHaveBeenCalled();
      expect(document.querySelector(`[data-testid="${TID.toast}"]`)!.textContent).toBe('扫完码再缩小');
    } finally { document.documentElement.classList.remove('scan-waiting'); }
    get(TID.browser.shrink)!.click();
    expect(f.invoke).toHaveBeenCalledWith('browser:show', { mode: 'pip' });
  });

  test('B-03 放大后能缩回画中画', () => {
    const f = setup();
    f.emit('browser', panel);
    expect(get(TID.browser.pip)).toBeNull();
    get(TID.browser.shrink)!.click();
    expect(f.invoke).toHaveBeenCalledWith('browser:show', { mode: 'pip' });
    f.emit('browser', pip);
    expect(get(TID.browser.pip)).not.toBeNull();
    expect(get(TID.browser.shrink)).toBeNull();
  });

  test('B-04 画中画上点 ✕ 才关，不会顺带放大', () => {
    const f = setup();
    f.emit('browser', pip);
    get(TID.browser.close)!.click();
    expect(f.invoke).toHaveBeenCalledTimes(1);
    expect(f.invoke).toHaveBeenCalledWith('browser:close');
    f.emit('browser', { ...pip, open: false });
    expect(get(TID.browser.pip)).toBeNull();
  });

  test('B-04 右侧面板点 ✕ 关', () => {
    const f = setup();
    f.emit('browser', panel);
    get(TID.browser.close)!.click();
    expect(f.invoke).toHaveBeenCalledWith('browser:close');
  });

  test('B-04 挂在外壳上，页面换内容时不动', () => {
    const f = setup();
    const page = document.createElement('section');
    root.append(page);
    f.emit('browser', pip);
    page.replaceChildren(document.createTextNode('设置页'));
    page.replaceChildren(document.createTextNode('帮助页'));
    expect(get(TID.browser.pip)).not.toBeNull();
  });

  test('B-05 地址栏只读；后退、刷新可用', () => {
    const f = setup();
    f.emit('browser', panel);
    const address = get(TID.browser.address) as HTMLInputElement;
    expect(address.readOnly).toBe(true);
    expect(address.value).toBe(panel.url);
    get(TID.browser.back)!.click();
    get(TID.browser.reload)!.click();
    expect(f.invoke).toHaveBeenCalledWith('browser:back');
    expect(f.invoke).toHaveBeenCalledWith('browser:reload');
  });

  test('B-05 没有上一页时后退按钮不能点', () => {
    const f = setup();
    f.emit('browser', { ...panel, canGoBack: false });
    expect((get(TID.browser.back) as HTMLButtonElement).disabled).toBe(true);
  });

  test('B-06 卸下后不再响应', () => {
    const f = setup();
    f.unmount();
    expect(f.count('browser')).toBe(0);
    expect(root.querySelector('.browser-host')).toBeNull();
  });
});
